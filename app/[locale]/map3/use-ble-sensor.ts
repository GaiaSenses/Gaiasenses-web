import { useRef, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MapRef } from "react-map-gl/mapbox";
import type { espCo2Response, GaiaballNav } from "./ble-decode";

type UseBLESensorOptions = {
  mapRef: React.RefObject<MapRef>;
  inputModeRef: React.MutableRefObject<string>;
  /** Mirrors the auto mode toggle: while it is on, the ball does not steer. */
  autoModeActiveRef: React.MutableRefObject<boolean>;
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
  autoModeActiveRef,
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
  // edge. `previousSettledRef` is null until the first applied packet after a
  // (re)connect, so being at rest when the link comes up is never mistaken for
  // having just stopped. `sawMovementRef` records that a packet with
  // settled = false was applied since the last connect — the flags' `moving`
  // bit is never consulted (mirror mode may send valid|settled|moving).
  const previousSettledRef = useRef<boolean | null>(null);
  const sawMovementRef = useRef(false);

  const resetNavTracking = useCallback(() => {
    previousSettledRef.current = null;
    sawMovementRef.current = false;
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
      if (!nav.valid) return;
      if ((searchParams.get("mode") ?? "map") !== "map") return;
      if (inputModeRef.current === "mouse") return;
      // Auto mode has precedence: its flyTo tour is not fought packet by packet.
      if (autoModeActiveRef.current) return;

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
    [searchParams, inputModeRef, autoModeActiveRef, mapRef, handleMotionStop],
  );

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
