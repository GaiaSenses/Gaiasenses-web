import { useRef, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MapRef } from "react-map-gl/mapbox";
import type { espCo2Response, GaiaballNav } from "./ble-decode";
import {
  NAV_TRACKER_RESET,
  navTrackerReenter,
  navTrackerStep,
  type NavTrackerEffects,
  type NavTrackerState,
} from "./nav-tracker";

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
 * when the ball comes to rest. The decisions live in nav-tracker.ts (a pure
 * step function); this hook holds its state and performs its effects.
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

  // Stop detection is the ball's (`settled`); what is tracked here is the
  // settled edge plus the latest valid pose, kept even while packets are
  // ignored (player mode, auto mode) so the globe can catch up when it listens
  // again. Reset on connect, on disconnect and by a valid = 0 keepalive; the
  // first settled packet after a reset syncs the globe once (nav-tracker.ts).
  const navTrackerRef = useRef<NavTrackerState>(NAV_TRACKER_RESET);

  // Whether the ball steers the globe: URL mode=map and auto mode off. Kept in
  // a ref written only by the re-entry effect below, so the gate opening and
  // the catch-up happen together — no packet can slip in between with stale
  // edge tracking.
  const navGateOpen =
    (searchParams.get("mode") ?? "map") === "map" && !autoModeActive;
  const navGateOpenRef = useRef(navGateOpen);

  const resetNavTracking = useCallback(() => {
    navTrackerRef.current = NAV_TRACKER_RESET;
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

  /** Performs what the tracker decided: state first, then the map, then the popup. */
  const applyNavEffects = useCallback(
    (fx: NavTrackerEffects) => {
      navTrackerRef.current = fx.state;
      if (fx.jumpTo) {
        mapRef.current?.jumpTo({
          center: fx.jumpTo.center,
          bearing: fx.jumpTo.bearing,
        });
      }
      if (fx.motionStop) handleMotionStop();
      else if (fx.reopenPopup) reopenPopup();
    },
    [mapRef, handleMotionStop, reopenPopup],
  );

  /**
   * Called for every NavPacket (up to navNotifyHz, 50 Hz by default). The map
   * is moved imperatively with `jumpTo` — never through React state — so a
   * packet costs one map frame and no render.
   *
   * While settled the map is left alone: the pose was already applied on the
   * way in, and a `jumpTo` would fire move events that hide the popup the stop
   * just opened. The one exception is the first settled packet after a
   * connect or a valid = 0 reset, which syncs the globe once.
   */
  const handleOnNav = useCallback(
    (nav: GaiaballNav) => {
      applyNavEffects(
        navTrackerStep(navTrackerRef.current, nav, {
          gateOpen: navGateOpenRef.current,
          inputMode: inputModeRef.current,
          urlLat: Number(searchParams.get("lat") ?? initialLat),
          urlLng: Number(searchParams.get("lng") ?? initialLng),
        }),
      );
    },
    [applyNavEffects, inputModeRef, searchParams, initialLat, initialLng],
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
    applyNavEffects(
      navTrackerReenter(navTrackerRef.current, {
        gateOpen: true,
        inputMode: inputModeRef.current,
        urlLat: Number(searchParams.get("lat") ?? initialLat),
        urlLng: Number(searchParams.get("lng") ?? initialLng),
      }),
    );
  }, [
    navGateOpen,
    searchParams,
    initialLat,
    initialLng,
    inputModeRef,
    applyNavEffects,
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
