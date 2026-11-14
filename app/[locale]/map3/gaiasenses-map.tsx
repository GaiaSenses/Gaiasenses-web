"use client";

import Map, {
  FullscreenControl,
  NavigationControl,
  GeolocateControl,
  Popup,
  ViewStateChangeEvent,
  MapRef,
} from "react-map-gl/mapbox";
import { Eye, EyeOff, MapPin, Volume2, VolumeX } from "lucide-react";

// @ts-ignore
import "mapbox-gl/dist/mapbox-gl.css";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { espCo2Response, espResponse, GaiaballNav } from "./ble-control";
import {
  MAP3_PD4WEB_PATCHES,
  patchReceivesLiveData,
  type Map3Pd4WebMoment,
} from "./pd4web-patches";
import { GAIA } from "@/lib/gaia-vocabulary";
import {
  publishGaiaballCo2,
  publishGaiaballConnected,
  publishGaiaballImu,
  publishGaiaballNav,
} from "@/lib/gaiaball-live";

import InfoButton from "./info-button";
import NotificationDialog from "./notifications-dialog";
import BLEControl from "./ble-control";
import AutoMove from "./auto-move";
import CoordinateDisplay from "./coordinate-display";
import CompositionInfoPanel from "./composition-info-panel";
import Pd4WebPatchLog, {
  type Pd4WebPatchLogControls,
  type Pd4WebPatchLogEntry,
} from "./pd4web-patch-log";

import { useMapInteractions } from "./use-map-interactions";
import { useAutoMode } from "./use-auto-mode";
import { useBLESensor } from "./use-ble-sensor";
import { decidePdSend } from "./pd-send-rule";
import { mapInteractionProps } from "./map-interaction-lock";
import {
  ClimaData,
  getCompositionDecisionTrace,
} from "./use-composition-queue";
import { enabledCompositionKeys } from "./map-constants";
import CompositionsInfo from "@/components/compositions/compositions-info";
import { usePd4Web } from "./pd4web-context";
import { Button } from "@/components/ui/button";

const MAP_PATCH_LOG_MAX_ENTRIES = 250;
const SHOW_COMPOSITION_PANEL_STORAGE_KEY = "map3-show-composition-panel";

/**
 * Settings of the motion-tuning panel, the CO2 threshold slider and the
 * removed /gaiaball bench. The ball now computes the navigation and decides the
 * CO2 trigger itself, so nothing reads these; they are removed once per load.
 */
const OBSOLETE_STORAGE_KEYS = [
  "map3-motion-tuning-settings",
  "map3-co2-threshold",
  "gaiaball-motion-tuning-settings",
  "gaiaball-co2-threshold",
  "gaiaball-ws-freq",
  "gaiaball-pd-ws-url",
];

/**
 * Whether map-centre movement is published to gaia.lat/gaia.lon.
 *
 * This was `false`, which silenced the drag sound without rebuilding the patch
 * — but it also made the two canonical position channels dead letters: the
 * flag sits before the `&&` in `shouldSendMapMovement`, so it overrode the
 * debug panel's "always send" toggle too, and no lat/lon ever reached a patch.
 * A musician listening on `gaia.lat` got nothing and had no way to tell that
 * from a patch bug.
 *
 * It is `true` again, which is the documented contract: the globe's position
 * is sent at `pollMs` (64 ms ≈ 15 Hz for paraisoGaia43), gated only by the
 * `epsilon` dead-band that drops sub-degree jitter. To silence a patch, mute
 * it or change the patch — not by cutting the data it is built to receive.
 */
const SEND_MAP_MOVEMENT_TO_PATCH = true;

function clampPatchPollMs(value: number) {
  return Math.max(16, Math.round(value));
}

function clampPatchEpsilon(value: number) {
  return Math.max(0, value);
}

type GaiasensesMapProps = {
  children: ReactNode;
  locationInfo: { name: string; state: string; country: string };
  weatherLabels: {
    temperature: string;
    humidity: string;
    clouds: string;
    wind: string;
    direction: string;
    gust: string;
    rain: string;
    co2: string;
    lightnings: string;
    firesSingular: string;
    firesPlural: string;
    unavailable: string;
  };
  initialLat: number;
  initialLng: number;
  mode: Map3Pd4WebMoment;
  composition: string | null;
  InfoButtonText: string;
  clima: ClimaData;
  /**
   * Contagens como a fonte respondeu: `null` quando ela não respondeu.
   * `clima` colapsa isso em zero para a escolha automática de composição; estas
   * duas preservam a distinção para que o painel possa dizer a verdade.
   */
  lightningCount: number | null;
  fireSpotsCount: number | null;
  weatherSummary: {
    description: string;
    temperature: number;
    humidity: number;
    clouds: number;
    windSpeed: number;
    windDeg: number;
    windGust: number;
    rain1h: number;
  };
};

export default function GaiasensesMap({
  children,
  initialLat,
  initialLng,
  mode,
  composition,
  InfoButtonText,
  clima,
  lightningCount,
  fireSpotsCount,
  weatherSummary,
  locationInfo,
  weatherLabels,
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
  const [showCompositionInfoPanel, setShowCompositionInfoPanel] =
    useState(true);
  const [currentCo2Ppm, setCurrentCo2Ppm] = useState<number | null>(null);
  // Changes only on connect/disconnect (never at packet rate): it locks the
  // map's mouse/touch handlers while the ball owns the globe.
  const [isBallConnected, setIsBallConnected] = useState(false);
  const [isPatchLogOpen, setIsPatchLogOpen] = useState(false);
  // Read by the Pd listeners and the poll tick, which outlive renders: with the
  // panel closed they skip the log append, so a Pd message or a poll tick costs
  // no map re-render.
  const isPatchLogOpenRef = useRef(isPatchLogOpen);
  useEffect(() => {
    isPatchLogOpenRef.current = isPatchLogOpen;
  }, [isPatchLogOpen]);
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
  const pdListListenerMapRef = useRef<WeakMap<pd4web.Pd4Web, Set<string>>>(
    new WeakMap(),
  );

  useEffect(() => {
    try {
      for (const key of OBSOLETE_STORAGE_KEYS) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Storage blocked (private window, site data disabled): nothing to clean.
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(
        SHOW_COMPOSITION_PANEL_STORAGE_KEY,
      );
      if (saved === "false") {
        setShowCompositionInfoPanel(false);
      }
    } catch {
      // Storage blocked: keep the default (panel visible).
    }
  }, []);

  const toggleCompositionInfoPanel = useCallback(() => {
    const next = !showCompositionInfoPanel;
    setShowCompositionInfoPanel(next);
    try {
      window.localStorage.setItem(
        SHOW_COMPOSITION_PANEL_STORAGE_KEY,
        String(next),
      );
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
  }, [showCompositionInfoPanel]);

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
/*T29: tirar scores (basta comentar os console.log's useEffect abaixo)
  useEffect(() => {
    console.log("—————————————————————————");
    console.log("Composição ativa:", composition);
    console.log("—————————————————————————");
  }, [composition]);*/

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

  const reopenPopup = useCallback(() => {
    setShowPopup(true);
  }, [setShowPopup]);

  const {
    handleOnNav,
    handleOnCO2Sensor,
    handleControllerConnect,
    handleControllerDisconnect,
  } = useBLESensor({
    mapRef,
    inputModeRef,
    autoModeActive: autoActive,
    reopenPopup,
    initialLat,
    initialLng,
    currentComposition: composition ?? "attractor",
  });

  const compositionInfo = composition
    ? CompositionsInfo[composition as keyof typeof CompositionsInfo]
    : null;

  const handleSensorSample = useCallback((data: espResponse) => {
    latestSensorDataRef.current = data;
    publishGaiaballImu(data);
  }, []);

  const handleCo2Sample = useCallback(
    (data: espCo2Response) => {
      latestCo2DataRef.current = data;
      publishGaiaballCo2(data);
      // CO2 arrives at ~1 Hz: cheap enough to keep as React state.
      setCurrentCo2Ppm(data.co2.ppm);
      handleOnCO2Sensor(data);
    },
    [handleOnCO2Sensor],
  );

  const handleNavSample = useCallback(
    (data: GaiaballNav) => {
      publishGaiaballNav(data);
      handleOnNav(data);
    },
    [handleOnNav],
  );

  const handleBleConnect = useCallback(
    (inputMode: string) => {
      publishGaiaballConnected(true);
      setIsBallConnected(true);
      handleControllerConnect(inputMode);
    },
    [handleControllerConnect],
  );

  const handleBleDisconnect = useCallback(
    (inputMode: string) => {
      publishGaiaballConnected(false);
      setIsBallConnected(false);
      handleControllerDisconnect(inputMode);
    },
    [handleControllerDisconnect],
  );

  const handleBleConnectionLost = useCallback(() => {
    publishGaiaballConnected(false);
  }, []);

  const {
    pd4web,
    activePatch,
    isInitializing,
    isStopping,
    status,
    startPatch,
    isMuted,
    isAudioStarted,
    toggleMute,
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

    if (!activePatch || !patchReceivesLiveData(activePatch)) {
      setIsPatchLogOpen(false);
      return;
    }

    setPatchLogControls({
      pollMs: clampPatchPollMs(activePatch.tuning.pollMs),
      epsilon: clampPatchEpsilon(activePatch.tuning.epsilon),
      accEpsilon: clampPatchEpsilon(activePatch.tuning.accEpsilon),
      alwaysSendMovement: false,
    });
    nextPatchLogIdRef.current = 0;
    setPatchLogs([]);
    appendPatchSystemLog(`Patch started: ${activePatch.id}`);

    // Report the resolved vocabulary so the panel shows what this patch will
    // actually receive, including the legacy receiver names it uses.
    for (const [channel, receiver] of Object.entries(
      activePatch.channels.receivers,
    )) {
      appendPatchSystemLog(
        channel === receiver ? `${channel}` : `${channel} -> [r ${receiver}]`,
      );
    }
    for (const [channel, sender] of Object.entries(
      activePatch.channels.senders,
    )) {
      appendPatchSystemLog(`${channel} <- [s ${sender}]`);
    }
  }, [activePatch, appendPatchSystemLog]);

  const isMapPatchDebugEnabled =
    isMapInputActive &&
    activePatch?.id ===
      MAP3_PD4WEB_PATCHES.find((patch) =>
        patch.activation.moments.includes("map"),
      )?.id &&
    Boolean(activePatch && patchReceivesLiveData(activePatch));

  useEffect(() => {
    if (!isMapPatchDebugEnabled) {
      setIsPatchLogOpen(false);
    }
  }, [isMapPatchDebugEnabled]);

  useEffect(() => {
    if (!pd4web || !activePatch || !isMapInputActive) {
      return;
    }

    if (!patchReceivesLiveData(activePatch)) {
      return;
    }

    const receivers = activePatch.channels.receivers;
    const senders = activePatch.channels.senders;
    const pollMs = clampPatchPollMs(patchLogControls.pollMs);
    const epsilon = clampPatchEpsilon(patchLogControls.epsilon);
    const accEpsilon = clampPatchEpsilon(patchLogControls.accEpsilon);
    const alwaysSendMovement = patchLogControls.alwaysSendMovement;

    // `gaia.out` (paraisoGaia43) used to steer the globe. The ball computes the
    // navigation now, so the list is only shown in the patch I/O log, and only
    // while that panel is open.
    const outputListReceiver = senders[GAIA.OUT];
    if (outputListReceiver) {
      const listenerMap = pdListListenerMapRef.current;
      const knownReceivers = listenerMap.get(pd4web) ?? new Set<string>();
      if (!knownReceivers.has(outputListReceiver)) {
        knownReceivers.add(outputListReceiver);
        listenerMap.set(pd4web, knownReceivers);

        pd4web.onListReceived(outputListReceiver, (_name, list) => {
          if (!isPatchLogOpenRef.current) {
            return;
          }
          if (!Array.isArray(list) || list.length === 0) {
            return;
          }

          appendPatchLogs([
            {
              timestamp: Date.now(),
              source: "outputList",
              receiver: outputListReceiver,
              value: null,
              delta: null,
              threshold: null,
              message: `[${list.join(" ")}]`,
            },
          ]);
        });
      }
    }

    let prevLat: number | null = null;
    let prevLng: number | null = null;
    let prevAccX: number | null = null;
    let prevAccY: number | null = null;
    let prevAccZ: number | null = null;
    let prevCo2: number | null = null;

    const pushSensorList = (tickLogs: Omit<Pd4WebPatchLogEntry, "id">[]) => {
      const euler = latestSensorDataRef.current?.euler;
      const acc = latestSensorDataRef.current?.acc;
      const co2 = latestCo2DataRef.current?.co2.ppm;

      const gyroX = Number.isFinite(euler?.roll) ? Number(euler?.roll) : 0;
      const gyroY = Number.isFinite(euler?.pitch) ? Number(euler?.pitch) : 0;
      const gyroZ = Number.isFinite(euler?.yaw) ? Number(euler?.yaw) : 0;
      const accX = Number.isFinite(acc?.x) ? Number(acc?.x) : 0;
      const accY = Number.isFinite(acc?.y) ? Number(acc?.y) : 0;
      const accZ = Number.isFinite(acc?.z) ? Number(acc?.z) : 0;
      const co2Value = Number.isFinite(co2) ? Number(co2) : 0;

      const packet = [gyroX, gyroY, gyroZ, accX, accY, accZ, co2Value];
      pd4web.sendList(receivers[GAIA.SENSORS], packet);
      tickLogs.push({
        timestamp: Date.now(),
        source: "sensorList",
        receiver: receivers[GAIA.SENSORS],
        value: null,
        delta: null,
        threshold: null,
        message: `[${packet.join(", ")}]`,
      });
    };

    // gaia.lat/gaia.lon from the map centre, then gaia.acc.* and gaia.co2,
    // each behind its own dead-band.
    const pushCanonical = (
      lat: number,
      lng: number,
      tickLogs: Omit<Pd4WebPatchLogEntry, "id">[],
    ) => {
      const latChanged = prevLat === null || Math.abs(lat - prevLat) >= epsilon;
      const lngChanged = prevLng === null || Math.abs(lng - prevLng) >= epsilon;
      const shouldSendMapMovement =
        SEND_MAP_MOVEMENT_TO_PATCH &&
        (alwaysSendMovement || latChanged || lngChanged);

      if (shouldSendMapMovement) {
        const latDelta = prevLat === null ? null : Math.abs(lat - prevLat);
        const lngDelta = prevLng === null ? null : Math.abs(lng - prevLng);

        prevLat = lat;
        prevLng = lng;

        if (receivers[GAIA.LAT]) {
          pd4web.sendFloat(receivers[GAIA.LAT], lat);
          tickLogs.push({
            timestamp: Date.now(),
            source: "lat",
            receiver: receivers[GAIA.LAT],
            value: lat,
            delta: latDelta,
            threshold: alwaysSendMovement ? null : epsilon,
          });
        }
        if (receivers[GAIA.LON]) {
          pd4web.sendFloat(receivers[GAIA.LON], lng);
          tickLogs.push({
            timestamp: Date.now(),
            source: "lng",
            receiver: receivers[GAIA.LON],
            value: lng,
            delta: lngDelta,
            threshold: alwaysSendMovement ? null : epsilon,
          });
        }
      }

      const acc = latestSensorDataRef.current?.acc;
      if (!acc) {
        return;
      }

      const accX = acc.x;
      const accY = acc.y;
      const accZ = acc.z;

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
        return;
      }

      prevAccX = accX;
      prevAccY = accY;
      prevAccZ = accZ;

      if (receivers[GAIA.ACC_X]) {
        pd4web.sendFloat(receivers[GAIA.ACC_X], accX);
        tickLogs.push({
          timestamp: Date.now(),
          source: "accX",
          receiver: receivers[GAIA.ACC_X],
          value: accX,
          delta: accXDelta,
          threshold: accEpsilon,
        });
      }
      if (receivers[GAIA.ACC_Y]) {
        pd4web.sendFloat(receivers[GAIA.ACC_Y], accY);
        tickLogs.push({
          timestamp: Date.now(),
          source: "accY",
          receiver: receivers[GAIA.ACC_Y],
          value: accY,
          delta: accYDelta,
          threshold: accEpsilon,
        });
      }
      if (receivers[GAIA.ACC_Z]) {
        pd4web.sendFloat(receivers[GAIA.ACC_Z], accZ);
        tickLogs.push({
          timestamp: Date.now(),
          source: "accZ",
          receiver: receivers[GAIA.ACC_Z],
          value: accZ,
          delta: accZDelta,
          threshold: accEpsilon,
        });
      }

      if (receivers[GAIA.CO2]) {
        const co2 = latestCo2DataRef.current?.co2.ppm;
        if (Number.isFinite(co2)) {
          const numericCo2 = Number(co2);
          const co2Changed =
            prevCo2 === null || Math.abs(numericCo2 - prevCo2) >= accEpsilon;
          if (co2Changed) {
            const co2Delta =
              prevCo2 === null ? null : Math.abs(numericCo2 - prevCo2);
            prevCo2 = numericCo2;
            pd4web.sendFloat(receivers[GAIA.CO2], numericCo2);
            tickLogs.push({
              timestamp: Date.now(),
              source: "co2",
              receiver: receivers[GAIA.CO2],
              value: numericCo2,
              delta: co2Delta,
              threshold: accEpsilon,
            });
          }
        }
      }
    };

    const intervalId = window.setInterval(() => {
      const map = mapRef.current;
      if (!map) {
        return;
      }

      const { sendSensorList, sendCanonical } = decidePdSend({
        sensorConnected: inputModeRef.current !== "mouse",
        hasSensorsReceiver: Boolean(receivers[GAIA.SENSORS]),
        publishesOut: Boolean(outputListReceiver),
      });

      const tickLogs: Omit<Pd4WebPatchLogEntry, "id">[] = [];

      if (sendSensorList) {
        pushSensorList(tickLogs);
      }

      if (sendCanonical) {
        const center = map.getCenter();
        pushCanonical(center.lat, center.lng, tickLogs);
      }

      if (tickLogs.length > 0 && isPatchLogOpenRef.current) {
        appendPatchLogs(tickLogs);
      }
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
    pdListListenerMapRef,
    pd4web,
    inputModeRef,
  ]);

  /**
   * Deliver the weather snapshot to the patch.
   *
   * This is deliberately its own effect rather than another branch inside the
   * polling interval above. That interval returns early on the sensor-list path
   * and is gated on a live accelerometer reading, so anything appended to it
   * would only ever fire with a BLE sensor attached and moving.
   *
   * It is also not gated on `isMapInputActive`: a patch paired with a
   * composition runs in player mode, where the map stops sending, and it should
   * still be able to hear the weather of the place the globe is pointing at.
   *
   * Weather arrives as a server-component prop and only changes when the
   * location does, so sending once per change is the whole job — no polling.
   */
  useEffect(() => {
    if (!pd4web || !activePatch) {
      return;
    }

    const receivers = activePatch.channels.receivers;
    const values: [channel: string, value: number | undefined][] = [
      [GAIA.TEMP, clima.temperature],
      [GAIA.HUMIDITY, clima.humidity],
      [GAIA.CLOUDS, clima.clouds],
      [GAIA.WIND_SPEED, clima.windSpeed],
      [GAIA.LIGHTNING, clima.lightnings],
      [GAIA.FIRE, clima.fireSpots],
      [GAIA.WIND_DEG, weatherSummary.windDeg],
      [GAIA.RAIN, weatherSummary.rain1h],
    ];

    const logs: Omit<Pd4WebPatchLogEntry, "id">[] = [];

    for (const [channel, value] of values) {
      const receiver = receivers[channel];
      if (!receiver || !Number.isFinite(value)) {
        continue;
      }

      pd4web.sendFloat(receiver, value as number);
      logs.push({
        timestamp: Date.now(),
        source: "weather",
        receiver,
        value: value as number,
        delta: null,
        threshold: null,
        message: channel,
      });
    }

    if (logs.length > 0) {
      appendPatchLogs(logs);
    }
  }, [pd4web, activePatch, isAudioStarted, clima, weatherSummary, appendPatchLogs]);

  // Patches are only loaded in response to a click, as before: nothing is
  // preloaded, so the single pd4web instance is never occupied by a patch the
  // user didn't ask for (a preloaded map patch was blocking the composition
  // patches such as lightningBolts / NightRain from loading).
  //
  //  - A patch is already loaded (e.g. by the composition dropdown): this just
  //    toggles mute, synchronously, inside the click.
  //  - Nothing loaded yet: load the map patch (muted), then unmute it.
  const handleToggleMuteClick = async () => {
    if (pd4web) {
      toggleMute();
      return;
    }

    const mapPatch = MAP3_PD4WEB_PATCHES.find((patch) =>
      patch.activation.moments.includes("map"),
    );
    if (!mapPatch) {
      return;
    }

    const started = await startPatch(mapPatch.id);
    if (started) {
      toggleMute();
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
          {isMuted ? (
            <Button
              variant={"secondary"}
              disabled={isBusy}
              onClick={handleToggleMuteClick}
            >
              <VolumeX></VolumeX>
            </Button>
          ) : (
            <Button
              variant={"secondary"}
              disabled={isBusy}
              onClick={handleToggleMuteClick}
            >
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
      <div className="absolute right-4 bottom-4 z-20 pointer-events-auto">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="bg-white/95 backdrop-blur"
          onClick={toggleCompositionInfoPanel}
          title="Mostrar/ocultar painel da composição"
          aria-label="Mostrar/ocultar painel da composição"
          aria-pressed={showCompositionInfoPanel}
        >
          {showCompositionInfoPanel ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
        </Button>
      </div>
      {mode === "player" && compositionInfo && showCompositionInfoPanel && (
        <CompositionInfoPanel
          lat={latlng[0]}
          lng={latlng[1]}
          locationInfo={locationInfo}
          weatherLabels={weatherLabels}
          compositionName={compositionInfo.name}
          compositionAuthor={compositionInfo.author}
          compositionAttributes={compositionInfo.attributes}
          weather={weatherSummary}
          lightningCount={lightningCount}
          fireSpotsCount={fireSpotsCount}
          co2Ppm={currentCo2Ppm}
        />
      )}
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
        {...mapInteractionProps(isBallConnected)}
        onMove={handleMove}
        onMoveEnd={(e: ViewStateChangeEvent) => {
          handleMoveEnd(e);
          if (autoActive) onMoveEndAuto(e);
        }}
      >
        <FullscreenControl containerId="the-container" />
        {/* With the ball connected the compass would reset a bearing the ball owns. */}
        <NavigationControl showCompass={!isBallConnected} />
        <AutoMove
          isActive={autoActive}
          locations={autoLocations}
          compositionOptions={enabledCompositionKeys}
          onSaveLocations={saveAutoLocations}
          onActivate={onAutoActivateToggle}
          onDeactivate={onAutoActivateToggle}
        />
        <BLEControl
          onSensor={handleSensorSample}
          onCo2Sensor={handleCo2Sample}
          onNav={handleNavSample}
          onConnect={handleBleConnect}
          onDisconnect={handleBleDisconnect}
          onConnectionLost={handleBleConnectionLost}
        />
        {/* Geolocation recentres the map: not while the ball owns the globe. */}
        {!isBallConnected && <GeolocateControl onGeolocate={onGeolocate} />}
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
