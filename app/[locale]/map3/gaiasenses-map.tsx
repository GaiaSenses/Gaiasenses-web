"use client";

import Map, {
  FullscreenControl,
  NavigationControl,
  GeolocateControl,
  Popup,
  ViewStateChangeEvent,
  MapRef,
} from "react-map-gl/mapbox";
import { MapPin, Volume2, VolumeX } from "lucide-react";

// @ts-ignore
import "mapbox-gl/dist/mapbox-gl.css";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { espCo2Response, espResponse } from "./ble-control";
import { MAP3_PD4WEB_PATCHES, type Map3Pd4WebMoment } from "./pd4web-patches";

import InfoButton from "./info-button";
import NotificationDialog from "./notifications-dialog";
import BLEControl from "./ble-control";
import AutoMove from "./auto-move";
import CoordinateDisplay from "./coordinate-display";
import MotionTuningPanel from "./motion-tuning-panel";
import Pd4WebPatchLog, {
  type Pd4WebPatchLogControls,
  type Pd4WebPatchLogEntry,
} from "./pd4web-patch-log";

import { useMapInteractions } from "./use-map-interactions";
import { useAutoMode } from "./use-auto-mode";
import { useBLESensor } from "./use-ble-sensor";
import { useCo2Simulation } from "./use-co2-simulation";
import {
  DEFAULT_MOTION_TUNING_SETTINGS,
  type MotionMappingMethod,
  type MotionTuningSettings,
} from "./use-sensor-smoothing";
import {
  ClimaData,
  getCompositionDecisionTrace,
} from "./use-composition-queue";
import {
  DEFAULT_CO2_LEVEL_THRESHOLD,
  enabledCompositionKeys,
} from "./map-constants";
import CompositionsInfo from "@/components/compositions/compositions-info";
import { usePd4Web } from "./pd4web-context";
import { Button } from "@/components/ui/button";

const MOTION_TUNING_STORAGE_KEY = "map3-motion-tuning-settings";
const CO2_THRESHOLD_STORAGE_KEY = "map3-co2-threshold";
const MAP_PATCH_LOG_MAX_ENTRIES = 250;
const VALID_MOTION_MAPPING_METHODS: MotionMappingMethod[] = [
  "euler",
  "quaternion",
  "basic",
];

function normalizeMotionTuningSettings(
  settings: Partial<MotionTuningSettings>,
): MotionTuningSettings {
  const normalized: MotionTuningSettings = {
    ...DEFAULT_MOTION_TUNING_SETTINGS,
    ...settings,
  };

  if (!VALID_MOTION_MAPPING_METHODS.includes(normalized.mappingMethod)) {
    normalized.mappingMethod = DEFAULT_MOTION_TUNING_SETTINGS.mappingMethod;
  }

  normalized.quaternionLatitudeOffset = Number.isFinite(
    normalized.quaternionLatitudeOffset,
  )
    ? Math.max(-45, Math.min(45, normalized.quaternionLatitudeOffset))
    : DEFAULT_MOTION_TUNING_SETTINGS.quaternionLatitudeOffset;
  normalized.quaternionLongitudeOffset = Number.isFinite(
    normalized.quaternionLongitudeOffset,
  )
    ? Math.max(-45, Math.min(45, normalized.quaternionLongitudeOffset))
    : DEFAULT_MOTION_TUNING_SETTINGS.quaternionLongitudeOffset;
  normalized.quaternionBearingOffset = Number.isFinite(
    normalized.quaternionBearingOffset,
  )
    ? Math.max(-180, Math.min(180, normalized.quaternionBearingOffset))
    : DEFAULT_MOTION_TUNING_SETTINGS.quaternionBearingOffset;

  return normalized;
}

function clampPatchPollMs(value: number) {
  return Math.max(16, Math.round(value));
}

function clampPatchEpsilon(value: number) {
  return Math.max(0, value);
}

type GaiasensesMapProps = {
  children: ReactNode;
  initialLat: number;
  initialLng: number;
  mode: Map3Pd4WebMoment;
  composition: string | null;
  InfoButtonText: string;
  clima: ClimaData;
};

export default function GaiasensesMap({
  children,
  initialLat,
  initialLng,
  mode,
  composition,
  InfoButtonText,
  clima,
}: GaiasensesMapProps) {
  const hasSharedPd4WebPatch =
    composition !== null &&
    Boolean(
      CompositionsInfo[composition as keyof typeof CompositionsInfo]
        ?.keepMapPatch,
    );
  const isMapAudioActive = mode === "map" || hasSharedPd4WebPatch;
  const isMapInputActive = mode === "map";

  const mapRef = useRef<MapRef>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const latestSensorDataRef = useRef<espResponse | null>(null);
  const latestCo2DataRef = useRef<espCo2Response | null>(null);
  const [motionTuning, setMotionTuning] = useState<MotionTuningSettings>(
    DEFAULT_MOTION_TUNING_SETTINGS,
  );
  const [co2Threshold, setCo2Threshold] = useState(DEFAULT_CO2_LEVEL_THRESHOLD);
  const [isPatchLogOpen, setIsPatchLogOpen] = useState(false);
  const [patchLogControls, setPatchLogControls] =
    useState<Pd4WebPatchLogControls>({
      pollMs: 64,
      epsilon: 1,
      accEpsilon: 0.05,
      alwaysSendMovement: false,
    });
  const [patchLogs, setPatchLogs] = useState<Pd4WebPatchLogEntry[]>([]);
  const nextPatchLogIdRef = useRef(0);
  const previousPatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(MOTION_TUNING_STORAGE_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as Partial<MotionTuningSettings>;
      setMotionTuning(normalizeMotionTuningSettings(parsed));
    } catch {
      window.localStorage.removeItem(MOTION_TUNING_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(CO2_THRESHOLD_STORAGE_KEY);
    if (!saved) {
      return;
    }

    const parsed = Number(saved);
    if (!Number.isFinite(parsed)) {
      window.localStorage.removeItem(CO2_THRESHOLD_STORAGE_KEY);
      return;
    }

    setCo2Threshold(parsed);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      MOTION_TUNING_STORAGE_KEY,
      JSON.stringify(motionTuning),
    );
  }, [motionTuning]);

  useEffect(() => {
    window.localStorage.setItem(CO2_THRESHOLD_STORAGE_KEY, `${co2Threshold}`);
  }, [co2Threshold]);

  useEffect(() => {
    if (!composition) {
      return;
    }

    const modeParam = searchParams.get("mode") ?? "map";
    const currentComposition = searchParams.get("composition");
    const hasPlayParam = searchParams.has("play");

    const shouldSyncComposition = currentComposition !== composition;
    const shouldCleanPlay = modeParam === "map" && hasPlayParam;

    if (!shouldSyncComposition && !shouldCleanPlay) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set("composition", composition);
    if (modeParam === "map") {
      nextSearchParams.delete("play");
    }
    router.replace(`${pathname}?${nextSearchParams.toString()}`);
  }, [composition, pathname, router, searchParams]);

  useEffect(() => {
    const trace = getCompositionDecisionTrace(clima);

    //checar no terminal:
    console.log("————————————————————————————————————————————————————");
    console.log("Scores:", trace.scores);
    console.log("Categoria escolhida:", trace.categoria);
    console.log("Composição escolhida:", trace.escolha);
    console.log("————————————————————————————————————————————————————");
  }, [clima]);

  const {
    latlng,
    showPopup,
    setShowPopup,
    isDataLoading,
    inputModeRef,
    handleMove,
    handleMoveEnd,
    onGeolocate,
    handleMouseMove,
  } = useMapInteractions({ initialLat, initialLng });

  const {
    autoActive,
    autoLocations,
    onAutoActivateToggle,
    onMoveEndAuto,
    saveAutoLocations,
  } = useAutoMode(mapRef);

  const {
    handleOnSensor,
    handleOnCO2Sensor,
    handleControllerConnect,
    handleControllerDisconnect,
    recalibrateSensor,
    motionDiagnostics,
    sensorDebug,
  } = useBLESensor({
    mapRef,
    inputModeRef,
    initialLat,
    initialLng,
    motionTuning,
    co2LevelThreshold: co2Threshold,
    currentComposition: composition ?? "attractor",
  });

  const {
    startSimulation: startCo2Simulation,
    isSimulating: isCo2Simulating,
    simulatedPpm: simulatedCo2Ppm,
  } = useCo2Simulation({
    onCo2Sample: handleOnCO2Sensor,
    startPpm: co2Threshold + 500,
    endPpm: co2Threshold,
    durationMs: 30_000,
    tickMs: 250,
  });

  const {
    pd4web,
    activePatch,
    isInitializing,
    isStopping,
    status,
    startPatch,
    stopPatch,
  } = usePd4Web();
  const isBusy = isInitializing || isStopping;

  const appendPatchLogs = useCallback(
    (entries: Omit<Pd4WebPatchLogEntry, "id">[]) => {
      if (entries.length === 0) {
        return;
      }

      setPatchLogs((current) => {
        const withIds = entries.map((entry) => ({
          ...entry,
          id: ++nextPatchLogIdRef.current,
        }));
        const next = [...withIds, ...current];
        return next.slice(0, MAP_PATCH_LOG_MAX_ENTRIES);
      });
    },
    [],
  );

  const appendPatchSystemLog = useCallback(
    (message: string) => {
      appendPatchLogs([
        {
          timestamp: Date.now(),
          source: "system",
          receiver: "system",
          value: null,
          delta: null,
          threshold: null,
          message,
        },
      ]);
    },
    [appendPatchLogs],
  );

  useEffect(() => {
    const currentPatchId = activePatch?.id ?? null;
    const previousPatchId = previousPatchIdRef.current;

    if (currentPatchId === previousPatchId) {
      return;
    }

    previousPatchIdRef.current = currentPatchId;

    if (previousPatchId && currentPatchId === null) {
      appendPatchSystemLog(`Patch stopped: ${previousPatchId}`);
    }

    if (!activePatch || activePatch.binding.type !== "map-center") {
      setIsPatchLogOpen(false);
      return;
    }

    setPatchLogControls({
      pollMs: clampPatchPollMs(activePatch.binding.pollMs ?? 100),
      epsilon: clampPatchEpsilon(activePatch.binding.epsilon ?? 0.0001),
      accEpsilon: clampPatchEpsilon(activePatch.binding.accEpsilon ?? 0.05),
      alwaysSendMovement: false,
    });
    nextPatchLogIdRef.current = 0;
    setPatchLogs([]);
    appendPatchSystemLog(`Patch started: ${activePatch.id}`);
  }, [activePatch, appendPatchSystemLog]);

  const isMapPatchDebugEnabled =
    isMapInputActive &&
    activePatch?.id ===
      MAP3_PD4WEB_PATCHES.find((patch) =>
        patch.activation.moments.includes("map"),
      )?.id &&
    activePatch?.binding.type === "map-center";

  useEffect(() => {
    if (!isMapPatchDebugEnabled) {
      setIsPatchLogOpen(false);
    }
  }, [isMapPatchDebugEnabled]);

  useEffect(() => {
    if (!pd4web || !activePatch || !isMapInputActive) {
      return;
    }

    if (activePatch.binding.type !== "map-center") {
      return;
    }

    const binding = activePatch.binding;
    const pollMs = clampPatchPollMs(patchLogControls.pollMs);
    const epsilon = clampPatchEpsilon(patchLogControls.epsilon);
    const accEpsilon = clampPatchEpsilon(patchLogControls.accEpsilon);
    const alwaysSendMovement = patchLogControls.alwaysSendMovement;

    let prevLat: number | null = null;
    let prevLng: number | null = null;
    let prevAccX: number | null = null;
    let prevAccY: number | null = null;
    let prevAccZ: number | null = null;

    const intervalId = window.setInterval(() => {
      const tickLogs: Omit<Pd4WebPatchLogEntry, "id">[] = [];
      const flushTickLogs = () => {
        if (tickLogs.length > 0) {
          appendPatchLogs(tickLogs);
        }
      };

      const map = mapRef.current;
      if (!map) {
        return;
      }

      const center = map.getCenter();
      const lat = center.lat;
      const lng = center.lng;

      const latChanged = prevLat === null || Math.abs(lat - prevLat) >= epsilon;
      const lngChanged = prevLng === null || Math.abs(lng - prevLng) >= epsilon;
      const shouldSendMapMovement =
        alwaysSendMovement || latChanged || lngChanged;

      if (shouldSendMapMovement) {
        const latDelta = prevLat === null ? null : Math.abs(lat - prevLat);
        const lngDelta = prevLng === null ? null : Math.abs(lng - prevLng);

        prevLat = lat;
        prevLng = lng;

        if (binding.latitudeReceiver) {
          pd4web.sendFloat(binding.latitudeReceiver, lat);
          tickLogs.push({
            timestamp: Date.now(),
            source: "lat",
            receiver: binding.latitudeReceiver,
            value: lat,
            delta: latDelta,
            threshold: alwaysSendMovement ? null : epsilon,
          });
        }
        if (binding.longitudeReceiver) {
          pd4web.sendFloat(binding.longitudeReceiver, lng);
          tickLogs.push({
            timestamp: Date.now(),
            source: "lng",
            receiver: binding.longitudeReceiver,
            value: lng,
            delta: lngDelta,
            threshold: alwaysSendMovement ? null : epsilon,
          });
        }
      }

      const acc = latestSensorDataRef.current?.acc;
      if (!acc) {
        flushTickLogs();
        return;
      }

      const accX = acc.x;
      const accY = acc.y;
      const accZ = acc.z;

      if (
        accX === null ||
        accX === undefined ||
        accY === null ||
        accY === undefined ||
        accZ === null ||
        accZ === undefined
      ) {
        flushTickLogs();
        return;
      }

      const accXDelta = prevAccX === null ? null : Math.abs(accX - prevAccX);
      const accYDelta = prevAccY === null ? null : Math.abs(accY - prevAccY);
      const accZDelta = prevAccZ === null ? null : Math.abs(accZ - prevAccZ);

      const accXChanged =
        prevAccX === null || Math.abs(accX - prevAccX) >= accEpsilon;
      const accYChanged =
        prevAccY === null || Math.abs(accY - prevAccY) >= accEpsilon;
      const accZChanged =
        prevAccZ === null || Math.abs(accZ - prevAccZ) >= accEpsilon;

      if (!(accXChanged || accYChanged || accZChanged)) {
        flushTickLogs();
        return;
      }

      prevAccX = accX;
      prevAccY = accY;
      prevAccZ = accZ;

      if (binding.accXReceiver) {
        pd4web.sendFloat(binding.accXReceiver, accX);
        tickLogs.push({
          timestamp: Date.now(),
          source: "accX",
          receiver: binding.accXReceiver,
          value: accX,
          delta: accXDelta,
          threshold: accEpsilon,
        });
      }
      if (binding.accYReceiver) {
        pd4web.sendFloat(binding.accYReceiver, accY);
        tickLogs.push({
          timestamp: Date.now(),
          source: "accY",
          receiver: binding.accYReceiver,
          value: accY,
          delta: accYDelta,
          threshold: accEpsilon,
        });
      }
      if (binding.accZReceiver) {
        pd4web.sendFloat(binding.accZReceiver, accZ);
        tickLogs.push({
          timestamp: Date.now(),
          source: "accZ",
          receiver: binding.accZReceiver,
          value: accZ,
          delta: accZDelta,
          threshold: accEpsilon,
        });
      }

      flushTickLogs();
    }, pollMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    activePatch,
    appendPatchLogs,
    isMapInputActive,
    patchLogControls.accEpsilon,
    patchLogControls.alwaysSendMovement,
    patchLogControls.epsilon,
    patchLogControls.pollMs,
    pd4web,
  ]);

  const handleUnmuteClick = () => {
    const mapPatch = MAP3_PD4WEB_PATCHES.find((patch) =>
      patch.activation.moments.includes("map"),
    );

    if (mapPatch) {
      if (!activePatch) {
        startPatch(mapPatch.id);
      }
      if (activePatch && activePatch.id === mapPatch.id) {
        console.log("Patch already started: ", activePatch.id);
      }
    }
  };

  const handleMuteClick = () => {
    if (activePatch) {
      stopPatch();
    }
  };
  return (
    <div
      style={{ height: "100svh", width: "100svw" }}
      className="relative"
      onMouseMove={handleMouseMove}
    >
      <CoordinateDisplay lat={latlng[0]} lng={latlng[1]} />

      <div className="absolute bottom-[1rem] left-4 z-10 flex flex-col gap-4">
        <Pd4WebPatchLog
          isEnabled={Boolean(isMapPatchDebugEnabled)}
          isOpen={isPatchLogOpen}
          onOpenChange={setIsPatchLogOpen}
          controls={patchLogControls}
          onControlsChange={setPatchLogControls}
          logs={patchLogs}
          onClearLogs={() => setPatchLogs([])}
          patchLabel={activePatch?.label ?? "Map sound 32"}
        />
        <div>
          {!activePatch ? (
            <Button
              variant={"secondary"}
              disabled={isBusy || activePatch !== null}
              onClick={handleUnmuteClick}
            >
              <VolumeX></VolumeX>
            </Button>
          ) : (
            <Button variant={"secondary"} onClick={handleMuteClick}>
              <Volume2></Volume2>
            </Button>
          )}
        </div>
        <div className="z-10 rounded bg-white/80 px-2 py-1 text-xs text-zinc-700 shadow">
          {status}
        </div>
      </div>

      <div>
        <NotificationDialog />
      </div>
      <div>
        <InfoButton />
      </div>
      <MotionTuningPanel
        settings={motionTuning}
        diagnostics={motionDiagnostics}
        sensorDebug={sensorDebug}
        co2Threshold={co2Threshold}
        onChange={setMotionTuning}
        onCo2ThresholdChange={setCo2Threshold}
        onReset={() => setMotionTuning(DEFAULT_MOTION_TUNING_SETTINGS)}
        onRecalibrate={recalibrateSensor}
        onSimulateCo2={startCo2Simulation}
        isCo2Simulating={isCo2Simulating}
        simulatedCo2Ppm={simulatedCo2Ppm}
      />
      <div>
        <AnimatePresence>
          {false && (
            <motion.div
              className="absolute top-1/2 left-1/2 bg-white z-[1] p-2 -translate-x-[50%] rounded-sm shadow-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div>
                <p className="text-sm italic">
                  Mova o globo para descobrir novas composições
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Map
        ref={mapRef}
        reuseMaps
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_API_ACCESS_TOKEN}
        initialViewState={{
          latitude: latlng[0],
          longitude: latlng[1],
          zoom: 2,
        }}
        mapStyle="mapbox://styles/mapbox/standard"
        projection={{ name: "globe" }}
        onMove={handleMove}
        onMoveEnd={(e: ViewStateChangeEvent) => {
          handleMoveEnd(e);
          if (autoActive) onMoveEndAuto(e);
        }}
      >
        <FullscreenControl containerId="the-container" />
        <NavigationControl />
        <AutoMove
          isActive={autoActive}
          locations={autoLocations}
          compositionOptions={enabledCompositionKeys}
          onSaveLocations={saveAutoLocations}
          onActivate={onAutoActivateToggle}
          onDeactivate={onAutoActivateToggle}
        />
        <BLEControl
          onSensor={(data) => {
            latestSensorDataRef.current = data;
            handleOnSensor(data);
          }}
          onCo2Sensor={(data) => {
            latestCo2DataRef.current = data;
            handleOnCO2Sensor(data);
          }}
          onConnect={handleControllerConnect}
          onDisconnect={handleControllerDisconnect}
        />
        <GeolocateControl onGeolocate={onGeolocate} />
        {showPopup && (
          <Popup
            key="info-popup"
            latitude={latlng[0]}
            longitude={latlng[1]}
            anchor="bottom"
            offset={36}
            onClose={() => setShowPopup(false)}
            closeOnClick={false}
            closeButton={false}
            maxWidth="40rem"
          >
            {isDataLoading ? (
              <div className="p-3 min-w-[200px] space-y-2">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
              </div>
            ) : (
              children
            )}
          </Popup>
        )}
      </Map>

      {/* <Pd4WebAudio
        moment={mode}
        composition={composition}
        mapRef={mapRef}
        active={isMapAudioActive}
        mapInputActive={isMapInputActive}
        accX={latestSensorDataRef.current?.acc?.x}
        accY={latestSensorDataRef.current?.acc?.y}
        accZ={latestSensorDataRef.current?.acc?.z}
      /> */}

      {/*
        CSS-centered pin — always at the visual center of the map canvas.
        Pure CSS positioning: zero React re-renders during globe movement.
        translate(-50%, -100%) puts the pin tip precisely at 50%/50%.
      */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <MapPin
          size={36}
          fill="white"
          strokeWidth={2}
          className="text-blue-600 drop-shadow-lg absolute"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -100%)",
          }}
        />
      </div>
    </div>
  );
}
