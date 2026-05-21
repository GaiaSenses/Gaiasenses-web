import { useRef, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MapRef } from "react-map-gl";
import {
  useSensorSmoothing,
  type MotionDiagnostics,
  type SensorDebugSnapshot,
  type MotionTuningSettings,
} from "./use-sensor-smoothing";
import type { espCo2Response } from "./ble-control";

type UseBLESensorOptions = {
  mapRef: React.RefObject<MapRef>;
  inputModeRef: React.MutableRefObject<string>;
  initialLat: number;
  initialLng: number;
  motionTuning: MotionTuningSettings;
  co2LevelThreshold: number;
  currentComposition: string;
};

export function useBLESensor({
  mapRef,
  inputModeRef,
  initialLat,
  initialLng,
  motionTuning,
  co2LevelThreshold,
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

  const { handleOnSensor, resetCalibration, diagnostics, sensorDebug } =
    useSensorSmoothing(mapRef, handleMotionStop, motionTuning);

  const handleControllerConnect = useCallback(
    (mode: string) => {
      inputModeRef.current = mode;
      resetCalibration();
    },
    [inputModeRef, resetCalibration],
  );

  const handleControllerDisconnect = useCallback(
    (mode: string) => {
      inputModeRef.current = mode;
      resetCalibration();
    },
    [inputModeRef, resetCalibration],
  );

  const handleOnCO2Sensor = useCallback(
    (data: espCo2Response) => {
      if (!isCompositionPlayingRef.current) {
        if (data.co2.ppm > co2LevelThreshold) {
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
        if (data.co2.ppm <= co2LevelThreshold) {
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
      co2LevelThreshold,
      currentComposition,
    ],
  );

  return {
    handleOnSensor,
    handleOnCO2Sensor,
    handleControllerConnect,
    handleControllerDisconnect,
    recalibrateSensor: resetCalibration,
    motionDiagnostics: diagnostics as MotionDiagnostics,
    sensorDebug: sensorDebug as SensorDebugSnapshot,
  };
}
