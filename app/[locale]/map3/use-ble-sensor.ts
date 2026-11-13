import { useRef, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MapRef } from "react-map-gl/mapbox";
import type { espCo2Response, GaiaballNav } from "./ble-decode";
import { decideNavReentry } from "./nav-reentry";

type UseBLESensorOptions = {
  mapRef: React.RefObject<MapRef>;
  inputModeRef: React.MutableRefObject<string>;
  /** Auto mode toggle: while it is on, the ball does not steer. */
  autoModeActive: boolean;
  /** Shows the weather popup again (a `jumpTo` hides it, see useMapInteractions). */
  reopenPopup: () => void;
  initialLat: number;
  initialLng: number;
  currentComposition: string;
};

/**
 * The globe follows the navigation the ball computes (NavPacket): no
 * calibration, filtering or stop detection happens here any more. The ball
 * says where the centre is, which way is up, and — through `settled` — when it
 * stopped; this hook only applies that to the map and opens the weather popup
 * when the ball comes to rest.
 */
export function useBLESensor({
  mapRef,
  inputModeRef,
  autoModeActive,
  reopenPopup,
  initialLat,
  initialLng,
  currentComposition,
}: UseBLESensorOptions) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Source of truth for whether a composition is active (or navigation to one
  // is in flight). Set to true synchronously when we trigger an open so that
  // duplicate sensor packets during the async router.replace() can't fire a
  // second open. Set back to false ONLY by the useEffect below, which runs
  // once navigation actually completes and searchParams reflects mode=map.
  // Never reset it synchronously in the close handler — that would release the
  // lock before the URL settles and allow a re-open race.
  const isCompositionPlayingRef = useRef(false);

  useEffect(() => {
    isCompositionPlayingRef.current = searchParams.get("mode") === "player";
  }, [searchParams]);

  // Stop detection is the ball's (`settled`); what is tracked here is only the
  // edge. `previousSettledRef` is null after a (re)connect and after a
  // valid = 0 keepalive, until the next applied packet (or a re-entry seeds
  // it), so being at rest when the link comes up is never mistaken for having
  // just stopped. `sawMovementRef` records that a pose with settled = false
  // was applied since the last connect — the flags' `moving` bit is never
  // consulted (mirror mode may send valid|settled|moving).
  const previousSettledRef = useRef<boolean | null>(null);
  const sawMovementRef = useRef(false);
  // The latest valid pose, kept even while packets are ignored (player mode,
  // auto mode), so the globe can catch up when it listens again. Cleared when
  // the ball says its navigation is off (valid = 0): that pose is disowned.
  const latestValidNavRef = useRef<GaiaballNav | null>(null);

  // Whether the ball steers the globe: URL mode=map and auto mode off. Kept in
  // a ref written only by the re-entry effect below, so the gate opening and
  // the catch-up happen together — no packet can slip in between with stale
  // edge tracking.
  const navGateOpen =
    (searchParams.get("mode") ?? "map") === "map" && !autoModeActive;
  const navGateOpenRef = useRef(navGateOpen);

  const resetNavTracking = useCallback(() => {
    previousSettledRef.current = null;
    sawMovementRef.current = false;
    latestValidNavRef.current = null;
  }, []);

  const handleMotionStop = useCallback(() => {
    const mode = searchParams.get("mode") ?? "map";
    if (
      inputModeRef.current !== "mouse" &&
      mode === "map" &&
      !isCompositionPlayingRef.current
    ) {
      const center = mapRef.current?.getCenter().wrap();
      if (center) {
        const newSearchParams = new URLSearchParams(searchParams.toString());
        newSearchParams.set("lat", center.lat.toString());
        newSearchParams.set("lng", center.lng.toString());
        newSearchParams.set("mode", "map");
        newSearchParams.delete("composition");
        newSearchParams.delete("play");
        router.replace(`${pathname}?${newSearchParams.toString()}`);
      }
    }
  }, [searchParams, inputModeRef, mapRef, pathname, router]);

  /**
   * Called for every NavPacket (up to navNotifyHz, 50 Hz by default). The map
   * is moved imperatively with `jumpTo` — never through React state — so a
   * packet costs one map frame and no render.
   *
   * While settled the map is left alone: the pose was already applied on the
   * way in, and a `jumpTo` would fire move events that hide the popup the stop
   * just opened.
   */
  const handleOnNav = useCallback(
    (nav: GaiaballNav) => {
      if (!nav.valid) {
        // Navigation off or IMU unavailable (1 Hz keepalive): forget the edge,
        // so motion before the dropout cannot turn into a popup after it.
        previousSettledRef.current = null;
        latestValidNavRef.current = null;
        return;
      }
      latestValidNavRef.current = nav;

      // Player mode and auto mode (which has precedence) close the gate; the
      // pose above is still remembered for when it reopens.
      if (!navGateOpenRef.current) return;
      if (inputModeRef.current === "mouse") return;

      const wasSettled = previousSettledRef.current;
      previousSettledRef.current = nav.settled;

      if (!nav.settled) {
        sawMovementRef.current = true;
        mapRef.current?.jumpTo({
          center: [nav.lon, nav.lat],
          bearing: nav.bearing,
        });
        return;
      }

      if (wasSettled === false && sawMovementRef.current) {
        // The packet that says "stopped" carries the final pose: apply it
        // once, then ask for the weather of where the globe came to rest.
        mapRef.current?.jumpTo({
          center: [nav.lon, nav.lat],
          bearing: nav.bearing,
        });
        handleMotionStop();
      }
    },
    [inputModeRef, mapRef, handleMotionStop],
  );

  /**
   * Re-entry: the gate reopens (player → map, or auto mode turned off). The
   * ball kept moving while it was closed, so its latest valid pose is applied
   * once and seeds the edge tracking (see nav-reentry.ts for the decision).
   *
   * Declared after the isCompositionPlayingRef effect on purpose: effects run
   * in order, so by now the composition lock already reflects mode=map and
   * handleMotionStop is allowed through.
   */
  useEffect(() => {
    const wasOpen = navGateOpenRef.current;
    navGateOpenRef.current = navGateOpen;
    if (wasOpen || !navGateOpen) return;
    if (inputModeRef.current === "mouse") return;

    const urlLat = Number(searchParams.get("lat") ?? initialLat);
    const urlLng = Number(searchParams.get("lng") ?? initialLng);
    const decision = decideNavReentry(latestValidNavRef.current, urlLat, urlLng);
    if (!decision) return;

    previousSettledRef.current = decision.settled;
    if (!decision.settled) {
      // A moving pose is about to be applied: the next settled packet is a
      // real stop and must open the popup.
      sawMovementRef.current = true;
    }

    mapRef.current?.jumpTo({
      center: decision.center,
      bearing: decision.bearing,
    });

    if (decision.refreshLocation) {
      handleMotionStop();
    } else if (decision.settled) {
      // Same place: the popup there is still right, but the jumpTo above just
      // hid it (any move does, while the ball is connected).
      reopenPopup();
    }
  }, [
    navGateOpen,
    searchParams,
    initialLat,
    initialLng,
    inputModeRef,
    mapRef,
    handleMotionStop,
    reopenPopup,
  ]);

  const handleControllerConnect = useCallback(
    (mode: string) => {
      inputModeRef.current = mode;
      resetNavTracking();
    },
    [inputModeRef, resetNavTracking],
  );

  const handleControllerDisconnect = useCallback(
    (mode: string) => {
      inputModeRef.current = mode;
      resetNavTracking();
    },
    [inputModeRef, resetNavTracking],
  );

  /**
   * The ball decides when a composition should be open (`trigger`, CO2 flags
   * bit3): it owns the threshold and its hysteresis and forces the trigger off
   * when the reading is stale. The site only follows the edge.
   */
  const handleOnCO2Sensor = useCallback(
    (data: espCo2Response) => {
      if (!isCompositionPlayingRef.current) {
        if (data.trigger) {
          const targetComposition =
            searchParams.get("composition") ??
            currentComposition ??
            "attractor";
          const newSearchParams = new URLSearchParams(searchParams.toString());
          newSearchParams.set(
            "lat",
            mapRef.current?.getCenter().lat.toString() ?? initialLat.toString(),
          );
          newSearchParams.set(
            "lng",
            mapRef.current?.getCenter().lng.toString() ?? initialLng.toString(),
          );
          newSearchParams.set("composition", targetComposition);
          newSearchParams.set("mode", "player");
          newSearchParams.set("play", "true");
          router.replace(`${pathname}?${newSearchParams.toString()}`);
          isCompositionPlayingRef.current = true;
        }
      } else {
        if (!data.trigger) {
          const newSearchParams = new URLSearchParams(searchParams.toString());
          newSearchParams.set("lat", searchParams.get("lat") ?? "0");
          newSearchParams.set("lng", searchParams.get("lng") ?? "0");
          newSearchParams.set("mode", "map");
          newSearchParams.delete("composition");
          newSearchParams.delete("play");
          router.replace(`${pathname}?${newSearchParams.toString()}`);
          // Do NOT set isCompositionPlayingRef.current = false here.
          // The lock is released by the useEffect above once searchParams
          // actually reflects mode=map after navigation completes.
        }
      }
    },
    [
      searchParams,
      mapRef,
      initialLat,
      initialLng,
      pathname,
      router,
      currentComposition,
    ],
  );

  return {
    handleOnNav,
    handleOnCO2Sensor,
    handleControllerConnect,
    handleControllerDisconnect,
  };
}
