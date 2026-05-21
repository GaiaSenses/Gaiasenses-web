"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useInterval from "@/hooks/use-interval";
import type { MapRef } from "react-map-gl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import BLEControl, {
  type espCo2Response,
  type espResponse,
} from "../map3/ble-control";
import MotionTuningPanel from "../map3/motion-tuning-panel";
import {
  DEFAULT_MOTION_TUNING_SETTINGS,
  type MotionTuningSettings,
  useSensorSmoothing,
} from "../map3/use-sensor-smoothing";
import { DEFAULT_CO2_LEVEL_THRESHOLD } from "../map3/map-constants";

const MOTION_TUNING_STORAGE_KEY = "gaiaball-motion-tuning-settings";
const CO2_THRESHOLD_STORAGE_KEY = "gaiaball-co2-threshold";
const PD_WS_STORAGE_KEY = "gaiaball-pd-ws-url";
const DEFAULT_PD_WS_URL =
  process.env.NEXT_PUBLIC_PD_WS_URL ?? "ws://localhost:9001/";

type WebSocketStatus = "connecting" | "open" | "closed" | "error";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(value: number) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function getDerivedCoordinates(
  alpha: number | null | undefined,
  beta: number | null | undefined,
  gamma: number | null | undefined,
) {
  if (
    typeof alpha !== "number" ||
    !Number.isFinite(alpha) ||
    typeof beta !== "number" ||
    !Number.isFinite(beta) ||
    typeof gamma !== "number" ||
    !Number.isFinite(gamma)
  ) {
    return { latitude: 0, longitude: 0, valid: false };
  }

  const yawRad = (alpha * Math.PI) / 180;
  return {
    latitude: clamp(
      -(beta * Math.cos(yawRad) - gamma * Math.sin(yawRad)),
      -85,
      85,
    ),
    longitude: normalizeAngle(-alpha),
    valid: true,
  };
}

function formatValue(value: number | null | undefined, digits = 3) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "—";
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border bg-white px-3 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="font-mono text-sm font-medium text-slate-900">
        {value}
      </span>
    </div>
  );
}

function SensorMonitorPageContent() {
  // ...existing code...
  const mapRef = useRef<MapRef>(null);
  const [rawSensorData, setRawSensorData] = useState<espResponse | null>(null);
  const [co2Data, setCo2Data] = useState<espCo2Response | null>(null);
  const [inputMode, setInputMode] = useState("mouse");
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>("connecting");
  const [wsEvents, setWsEvents] = useState<string[]>([]);
  const [pdWsUrl, setPdWsUrl] = useState(DEFAULT_PD_WS_URL);
  const [pdWsUrlInput, setPdWsUrlInput] = useState(DEFAULT_PD_WS_URL);
  const [motionTuning, setMotionTuning] = useState<MotionTuningSettings>(
    DEFAULT_MOTION_TUNING_SETTINGS,
  );
  const [co2Threshold, setCo2Threshold] = useState(DEFAULT_CO2_LEVEL_THRESHOLD);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  // Frequency state (Hz)
  const DEFAULT_FREQ = 60;
  const MIN_FREQ = 1;
  const MAX_FREQ = 120;
  const FREQ_STORAGE_KEY = "gaiaball-ws-freq";
  const [frequency, setFrequency] = useState<number>(DEFAULT_FREQ);
  // Load frequency from localStorage
  useEffect(() => {
    const saved = window.localStorage.getItem(FREQ_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= MIN_FREQ && parsed <= MAX_FREQ) {
        setFrequency(parsed);
      }
    }
  }, []);

  // Persist frequency to localStorage
  useEffect(() => {
    window.localStorage.setItem(FREQ_STORAGE_KEY, String(frequency));
  }, [frequency]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const latestPayloadRef = useRef<Record<string, unknown> | null>(null);
  const co2PpmRef = useRef<number | null>(null);
  const lastSentPayloadRef = useRef("");

  useEffect(() => {
    const saved = window.localStorage.getItem(MOTION_TUNING_STORAGE_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as Partial<MotionTuningSettings>;
      setMotionTuning((current) => ({ ...current, ...parsed }));
    } catch {
      window.localStorage.removeItem(MOTION_TUNING_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      MOTION_TUNING_STORAGE_KEY,
      JSON.stringify(motionTuning),
    );
  }, [motionTuning]);

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
    window.localStorage.setItem(CO2_THRESHOLD_STORAGE_KEY, `${co2Threshold}`);
  }, [co2Threshold]);

  useEffect(() => {
    const savedPdWsUrl = window.localStorage.getItem(PD_WS_STORAGE_KEY);
    if (!savedPdWsUrl) {
      return;
    }

    setPdWsUrl(savedPdWsUrl);
    setPdWsUrlInput(savedPdWsUrl);
  }, []);

  const { handleOnSensor, resetCalibration, diagnostics, sensorDebug } =
    useSensorSmoothing(mapRef, undefined, motionTuning);

  const appendWsEvent = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString("en-GB", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    setWsEvents((current) =>
      [`[${timestamp}] ${message}`, ...current].slice(0, 50),
    );
  }, []);

  useEffect(() => {
    co2PpmRef.current = co2Data?.co2.ppm ?? null;
  }, [co2Data?.co2.ppm]);

  const derivedCoordinates = useMemo(
    () =>
      getDerivedCoordinates(
        sensorDebug.smoothedEuler.alpha,
        sensorDebug.smoothedEuler.beta,
        sensorDebug.smoothedEuler.gamma,
      ),
    [
      sensorDebug.smoothedEuler.alpha,
      sensorDebug.smoothedEuler.beta,
      sensorDebug.smoothedEuler.gamma,
    ],
  );

  const publishLatestPayload = useCallback(() => {
    const socket = wsRef.current;
    const payload = latestPayloadRef.current as {
      raw?: espResponse | null;
      smoothed?: {
        relativeEuler?: { yaw: number; pitch: number; roll: number } | null;
        smoothedEuler?: { alpha: number; beta: number; gamma: number };
      };
      diagnostics?: {
        phase?: string;
        motionMagnitude?: number;
      };
    } | null;

    if (!socket || socket.readyState !== WebSocket.OPEN || !payload) {
      return;
    }

    const messageKey = JSON.stringify(payload);

    if (messageKey === lastSentPayloadRef.current) {
      return;
    }

    const smoothAlpha = payload.smoothed?.smoothedEuler?.alpha;
    const smoothBeta = payload.smoothed?.smoothedEuler?.beta;
    const smoothGamma = payload.smoothed?.smoothedEuler?.gamma;
    const { latitude: derivedLatitude, longitude: derivedLongitude } =
      getDerivedCoordinates(smoothAlpha, smoothBeta, smoothGamma);

    const values = [
      derivedLatitude.toFixed(6),
      derivedLongitude.toFixed(6),
      smoothAlpha?.toFixed(3),
      smoothBeta?.toFixed(3),
      smoothGamma?.toFixed(3),
      payload.raw?.euler?.yaw?.toFixed(3),
      payload.raw?.euler?.pitch?.toFixed(3),
      payload.raw?.euler?.roll?.toFixed(3),
      payload.raw?.acc?.x?.toFixed(3),
      payload.raw?.acc?.y?.toFixed(3),
      payload.raw?.acc?.z?.toFixed(3),
      co2PpmRef.current?.toFixed(3) ?? 0,
    ];
    // const message = `list ${values
    //   .map((value) => (value ? value : "0"))
    //   .join(" ")};`;

    const message = values
      //.map((value) => (typeof value === "string" ? value : "0"))
      .join(" ");

    socket.send(message);
    appendWsEvent(`sensor payload sent: ${message}`);

    lastSentPayloadRef.current = messageKey;
  }, [appendWsEvent]);

  const streamedPayload = useMemo(
    () => ({
      source: "gaiaball",
      sentAt: lastPublishedAt,
      raw: rawSensorData,
      smoothed: sensorDebug,
      diagnostics,
      tuning: motionTuning,
      co2: co2Data,
    }),
    [
      rawSensorData,
      sensorDebug,
      diagnostics,
      motionTuning,
      co2Data,
      lastPublishedAt,
    ],
  );

  const [isRandomSending, setIsRandomSending] = useState(false);

  const pdMessageExamples = useMemo(
    () => [
      `${formatValue(derivedCoordinates.latitude, 6)} ${formatValue(derivedCoordinates.longitude, 6)} ${formatValue(sensorDebug.smoothedEuler.alpha)} ${formatValue(sensorDebug.smoothedEuler.beta)} ${formatValue(sensorDebug.smoothedEuler.gamma)} ${formatValue(rawSensorData?.euler?.yaw)} ${formatValue(rawSensorData?.euler?.pitch)} ${formatValue(rawSensorData?.euler?.roll)} ${formatValue(rawSensorData?.acc?.x, 0)} ${formatValue(rawSensorData?.acc?.y, 0)} ${formatValue(rawSensorData?.acc?.z, 0)} ${co2Data?.co2.ppm ?? 0}`,
      `order: latitude longitude smooth_alpha smooth_beta smooth_gamma raw_yaw raw_pitch raw_roll raw_accX raw_accY raw_accZ co2`,
    ],
    [rawSensorData, sensorDebug, co2Data, derivedCoordinates],
  );

  const sendRandomTestMessage = useCallback(() => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setWsStatus("error");
      appendWsEvent("cannot send random payload: socket not open");
      return;
    }

    const randomPayload = {
      source: "gaiaball-test",
      sentAt: new Date().toISOString(),
      raw: {
        euler: {
          yaw: Number((Math.random() * 360 - 180).toFixed(3)),
          pitch: Number((Math.random() * 180 - 90).toFixed(3)),
          roll: Number((Math.random() * 180 - 90).toFixed(3)),
        },
        acc: {
          x: Math.floor(Math.random() * 10000),
          y: Math.floor(Math.random() * 10000),
          z: Math.floor(Math.random() * 10000),
        },
      },
      smoothed: {
        smoothedEuler: {
          alpha: Number((Math.random() * 360 - 180).toFixed(3)),
          beta: Number((Math.random() * 180 - 90).toFixed(3)),
          gamma: Number((Math.random() * 180 - 90).toFixed(3)),
        },
      },
      diagnostics: {
        phase: "test",
        motionMagnitude: Number((Math.random() * 3).toFixed(3)),
      },
    };

    const randomCoordinates = getDerivedCoordinates(
      randomPayload.smoothed.smoothedEuler.alpha,
      randomPayload.smoothed.smoothedEuler.beta,
      randomPayload.smoothed.smoothedEuler.gamma,
    );

    const message = [
      randomCoordinates.latitude.toFixed(6),
      randomCoordinates.longitude.toFixed(6),
      randomPayload.smoothed.smoothedEuler.alpha,
      randomPayload.smoothed.smoothedEuler.beta,
      randomPayload.smoothed.smoothedEuler.gamma,
      randomPayload.raw.euler.yaw,
      randomPayload.raw.euler.pitch,
      randomPayload.raw.euler.roll,
      randomPayload.raw.acc.x,
      randomPayload.raw.acc.y,
      randomPayload.raw.acc.z,
      0,
    ].join(" ");
    socket.send(message);
    appendWsEvent("random payload sent");
  }, [appendWsEvent]);

  // Send payload at selected frequency — use random data when toggled on
  const intervalMs = Math.round(1000 / frequency);
  const intervalCallback = useCallback(() => {
    if (isRandomSending) {
      sendRandomTestMessage();
    } else {
      publishLatestPayload();
    }
  }, [isRandomSending, sendRandomTestMessage, publishLatestPayload]);
  useInterval(intervalCallback, intervalMs);

  useEffect(() => {
    latestPayloadRef.current = streamedPayload;
  }, [streamedPayload]);

  useEffect(() => {
    if (!pdWsUrl || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(PD_WS_STORAGE_KEY, pdWsUrl);
    setWsStatus("connecting");

    let cancelled = false;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (cancelled) {
        return;
      }

      appendWsEvent(`connecting to ${pdWsUrl}`);

      socket = new WebSocket(pdWsUrl);
      wsRef.current = socket;

      socket.addEventListener("open", () => {
        if (cancelled) {
          return;
        }

        setWsStatus("open");
        appendWsEvent("socket open");
        lastSentPayloadRef.current = "";
        publishLatestPayload();
      });

      socket.addEventListener("close", (event) => {
        if (cancelled) {
          return;
        }

        setWsStatus("closed");
        appendWsEvent(
          `socket closed (code=${event.code}${event.reason ? ` reason=${event.reason}` : ""})`,
        );
        if (wsRef.current === socket) {
          wsRef.current = null;
        }

        appendWsEvent("reconnect scheduled in 2s");
        reconnectTimerRef.current = window.setTimeout(connect, 2000);
      });

      socket.addEventListener("error", () => {
        if (cancelled) {
          return;
        }

        setWsStatus("error");
        appendWsEvent("socket error");
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socket?.close();
      appendWsEvent("connection cleanup");
      if (wsRef.current === socket) {
        wsRef.current = null;
      }
    };
  }, [appendWsEvent, pdWsUrl, publishLatestPayload]);

  return (
    <div className="relative min-h-screen bg-slate-100 text-slate-900">
      <div className="fixed top-4 right-4 z-50 bg-white rounded shadow p-4 flex flex-col gap-2 w-64">
        <label
          htmlFor="ws-frequency"
          className="text-xs font-medium text-slate-700 flex justify-between"
        >
          WebSocket update rate
          <span className="font-mono">{frequency} Hz</span>
        </label>
        <input
          id="ws-frequency"
          type="range"
          min={MIN_FREQ}
          max={MAX_FREQ}
          step={1}
          value={frequency}
          onChange={(e) => setFrequency(Number(e.target.value))}
        />
        <div className="flex justify-between text-xs text-slate-400">
          <span>{MIN_FREQ} Hz</span>
          <span>{MAX_FREQ} Hz</span>
        </div>
      </div>
      <div className="absolute top-[-264px] h-16 w-16 left-1/2">
        <BLEControl
          onSensor={(data) => {
            setRawSensorData(data);
            setLastPublishedAt(new Date().toISOString());
            handleOnSensor(data);
          }}
          onCo2Sensor={(data) => setCo2Data(data)}
          onConnect={setInputMode}
          onDisconnect={setInputMode}
          containerClassName="top-0 left-1/2 right-auto -translate-x-1/2"
          buttonClassName="rounded-full bg-sky-400 text-sky-500 hover:bg-sky-500 hover:text-white"
          errorClassName="mx-auto mr-0 max-w-[240px] text-center"
          infoCardClassName="mx-auto mr-0 mt-4 w-64"
          showButtonLabel
        />
      </div>

      <MotionTuningPanel
        settings={motionTuning}
        diagnostics={diagnostics}
        sensorDebug={sensorDebug}
        co2Threshold={co2Threshold}
        onChange={setMotionTuning}
        onCo2ThresholdChange={setCo2Threshold}
        onReset={() => setMotionTuning(DEFAULT_MOTION_TUNING_SETTINGS)}
        onRecalibrate={resetCalibration}
      />

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pt-24 pb-8 md:px-6">
        <div className="space-y-2 pr-14">
          <h1 className="text-3xl font-semibold tracking-tight">
            Gaiaball sensor monitor
          </h1>
          <p className="max-w-3xl text-sm text-slate-600">
            This page reuses the existing Bluetooth and smoothing logic from the
            map3 experience so you can compare the raw BLE payload with the
            filtered values used for motion tuning and stream them directly into
            a Pure Data patch running a websocket server.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Input mode</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold capitalize">
              {inputMode}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Phase</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold capitalize">
              {diagnostics.phase}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Motion magnitude</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {diagnostics.motionMagnitude.toFixed(3)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">CO₂ ppm</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {co2Data?.co2.ppm ?? "—"}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">WebSocket</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div
                className={`text-lg font-semibold capitalize ${
                  wsStatus === "open"
                    ? "text-emerald-600"
                    : wsStatus === "connecting"
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {wsStatus}
              </div>
              <div className="break-all text-xs text-slate-500">
                {pdWsUrl || "Starting…"}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pure Data websocket connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input
                value={pdWsUrlInput}
                onChange={(event) => setPdWsUrlInput(event.target.value)}
                placeholder="ws://localhost:9001/"
              />
              <Button
                type="button"
                onClick={() => {
                  appendWsEvent("manual reconnect requested");
                  setPdWsUrl(pdWsUrlInput.trim() || DEFAULT_PD_WS_URL);
                }}
              >
                Reconnect Pd socket
              </Button>
            </div>
            <p className="text-sm text-slate-600">
              In your teammate’s patch, start the server with websocket-server
              on port 9001. The browser will connect here automatically and
              publish the live sensor values as soon as Bluetooth is connected.
            </p>
            <p className="text-sm text-slate-600">
              Note: Bluetooth still requires one user click on the gamepad icon
              because browsers do not allow automatic device pairing on page
              load.
            </p>
            <div>
              <Button
                type="button"
                variant="default"
                onClick={() => setIsRandomSending((v) => !v)}
                disabled={wsStatus !== "open"}
                className={`shadow-sm transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50 ${
                  isRandomSending
                    ? "bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700"
                    : "bg-violet-600 text-white hover:bg-violet-500 active:bg-violet-700"
                }`}
              >
                {isRandomSending ? "Stop random data" : "Start random data"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>WebSocket event log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Newest events first. Keeps last 50 entries.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setWsEvents([])}
              >
                Clear log
              </Button>
            </div>
            <div className="max-h-56 overflow-auto rounded border bg-slate-950 p-3 text-xs text-slate-100">
              <pre className="whitespace-pre-wrap break-words">
                {wsEvents.length > 0
                  ? wsEvents.join("\n")
                  : "No websocket events yet."}
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How the data is sent to Pure Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              The page now sends one flat space-separated list of values in this
              exact order so Pure Data can unpack them easily.
            </p>

            <div className="rounded border bg-slate-950 p-3 text-xs text-slate-100">
              <pre className="overflow-x-auto whitespace-pre-wrap break-all">
                {pdMessageExamples.join("\n")}
              </pre>
            </div>

            <div className="rounded border bg-slate-50 p-3 text-sm text-slate-700">
              <p className="mb-2 font-medium">Suggested Pd routing</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">
                {`[websocket-server 9001]
|
[list trim]
|
[unpack f f f f f f f f f f f f]

order:
latitude longitude smooth_alpha smooth_beta smooth_gamma raw_yaw raw_pitch raw_roll raw_accX raw_accY raw_accZ co2`}
              </pre>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Raw sensor values</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <MetricRow
                label="Yaw"
                value={formatValue(rawSensorData?.euler?.yaw)}
              />
              <MetricRow
                label="Pitch"
                value={formatValue(rawSensorData?.euler?.pitch)}
              />
              <MetricRow
                label="Roll"
                value={formatValue(rawSensorData?.euler?.roll)}
              />
              <MetricRow
                label="acc.x"
                value={formatValue(rawSensorData?.acc?.x, 0)}
              />
              <MetricRow
                label="acc.y"
                value={formatValue(rawSensorData?.acc?.y, 0)}
              />
              <MetricRow
                label="acc.z"
                value={formatValue(rawSensorData?.acc?.z, 0)}
              />

              <div className="rounded border bg-slate-950 p-3 text-xs text-slate-100">
                <div className="mb-2 font-medium text-slate-300">
                  Raw BLE payload
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(rawSensorData, null, 2) || "No data yet"}
                </pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Smoothed motion values</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <MetricRow
                label="Payload latitude"
                value={formatValue(derivedCoordinates.latitude, 6)}
              />
              <MetricRow
                label="Payload longitude"
                value={formatValue(derivedCoordinates.longitude, 6)}
              />
              <MetricRow
                label="Relative yaw"
                value={formatValue(sensorDebug.relativeEuler?.yaw)}
              />
              <MetricRow
                label="Relative pitch"
                value={formatValue(sensorDebug.relativeEuler?.pitch)}
              />
              <MetricRow
                label="Relative roll"
                value={formatValue(sensorDebug.relativeEuler?.roll)}
              />
              <MetricRow
                label="Filtered alpha"
                value={formatValue(sensorDebug.smoothedEuler.alpha)}
              />
              <MetricRow
                label="Filtered beta"
                value={formatValue(sensorDebug.smoothedEuler.beta)}
              />
              <MetricRow
                label="Filtered gamma"
                value={formatValue(sensorDebug.smoothedEuler.gamma)}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Current motion tuning</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(motionTuning).map(([key, value]) => (
                <MetricRow key={key} label={key} value={String(value)} />
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-600">
              Open the Motion Tuning panel at the bottom-right to change the
              values live and watch how the filtered readings respond.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              The page sends only the raw numeric list in this order: latitude
              longitude smooth_alpha smooth_beta smooth_gamma raw_yaw raw_pitch
              raw_roll raw_accX raw_accY raw_accZ co2.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-700">
          Loading sensor monitor…
        </div>
      }
    >
      <SensorMonitorPageContent />
    </Suspense>
  );
}
