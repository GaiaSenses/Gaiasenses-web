"use client";

import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type {
  MotionMappingMethod,
  MotionDiagnostics,
  QuaternionProjectionChannel,
  SensorDebugSnapshot,
  SignedQuaternionComponent,
  MotionTuningSettings,
} from "./use-sensor-smoothing";
import { DEFAULT_MOTION_TUNING_SETTINGS } from "./use-sensor-smoothing";
import { createPortal } from "react-dom";

type MotionTuningPanelProps = {
  settings: MotionTuningSettings;
  diagnostics: MotionDiagnostics;
  sensorDebug: SensorDebugSnapshot;
  co2Threshold: number;
  onChange: (settings: MotionTuningSettings) => void;
  onCo2ThresholdChange: (value: number) => void;
  onReset: () => void;
  onRecalibrate: () => void;
  /** When provided, a simulate button appears in the CO2 Trigger section. */
  onSimulateCo2?: () => void;
  /** Whether the CO2 simulation is currently running. */
  isCo2Simulating?: boolean;
  /** Live ppm value shown while the simulation is running. */
  simulatedCo2Ppm?: number | null;
};

type TuningField = {
  key: NumericTuningKey;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
};

type NumericTuningKey = Exclude<
  keyof MotionTuningSettings,
  | "mappingMethod"
  | "invertLatitude"
  | "invertLongitude"
  | "invertBearing"
  | "quaternionRemapW"
  | "quaternionRemapX"
  | "quaternionRemapY"
  | "quaternionRemapZ"
  | "quaternionLatitudeFrom"
  | "quaternionLongitudeFrom"
  | "quaternionBearingFrom"
>;

type TuningPreset = {
  name: string;
  description: string;
  settings: Partial<MotionTuningSettings>;
};

const mappingMethods: { label: string; value: MotionMappingMethod }[] = [
  { label: "Euler", value: "euler" },
  { label: "Quaternion", value: "quaternion" },
];

const signedQuaternionComponentOptions: {
  label: string;
  value: SignedQuaternionComponent;
}[] = [
  { label: "w", value: "w" },
  { label: "x", value: "x" },
  { label: "y", value: "y" },
  { label: "z", value: "z" },
  { label: "-w", value: "-w" },
  { label: "-x", value: "-x" },
  { label: "-y", value: "-y" },
  { label: "-z", value: "-z" },
];

const projectionChannelOptions: {
  label: string;
  value: QuaternionProjectionChannel;
}[] = [
  { label: "Latitude", value: "latitude" },
  { label: "Longitude", value: "longitude" },
  { label: "Bearing", value: "bearing" },
];

const tuningFields: TuningField[] = [
  {
    key: "bufferSize",
    label: "Median buffer",
    description:
      "How many recent sensor samples are used for the median filter. Higher values reject spikes better but add more lag.",
    min: 1,
    max: 15,
    step: 1,
  },
  {
    key: "calibrationSampleCount",
    label: "Calibration samples",
    description:
      "How many samples are averaged when you calibrate. Higher values give a steadier zero point, but calibration takes a bit longer.",
    min: 1,
    max: 20,
    step: 1,
  },
  {
    key: "emaAlpha",
    label: "EMA alpha",
    description:
      "How quickly the filtered motion follows new sensor values. Higher values feel faster and more responsive; lower values feel smoother and more damped.",
    min: 0.01,
    max: 1,
    step: 0.01,
  },
  {
    key: "mapUpdateHz",
    label: "Map update rate",
    description:
      "How often the digital globe is updated. Higher rates can feel more immediate, but may expose more sensor noise.",
    min: 5,
    max: 60,
    step: 1,
    unit: "Hz",
  },
  {
    key: "maxDeltaPerUpdate",
    label: "Max angle step",
    description:
      "Maximum map movement allowed per update. Lower values prevent sudden jumps; higher values let the map catch up faster after quick motion.",
    min: 0.1,
    max: 10,
    step: 0.1,
    unit: "deg",
  },
  {
    key: "motionStartThreshold",
    label: "Motion start threshold",
    description:
      "How much movement is required before the system treats the globe as intentionally moving. Raise it to ignore tiny nudges and drift.",
    min: 0.01,
    max: 4,
    step: 0.01,
    unit: "deg",
  },
  {
    key: "motionStopThreshold",
    label: "Motion stop threshold",
    description:
      "How quiet the sensor must become before the stop detector starts timing a stop. Lower values demand a cleaner stop; higher values stop sooner.",
    min: 0.01,
    max: 2,
    step: 0.01,
    unit: "deg",
  },
  {
    key: "motionSettleDuration",
    label: "Settle duration",
    description:
      "How long low motion must continue before entering the settling phase. Longer values are better for wobble and residual motion.",
    min: 0,
    max: 1500,
    step: 10,
    unit: "ms",
  },
  {
    key: "motionStopDuration",
    label: "Stop duration",
    description:
      "How long low motion must continue before the weather popup can open. Longer values reduce false stops, shorter values feel faster.",
    min: 50,
    max: 3000,
    step: 10,
    unit: "ms",
  },
  {
    key: "popupHardLockDuration",
    label: "Popup hard lock",
    description:
      "How long sensor input is fully ignored right after the popup opens. Increase it if accidental bumps move the globe too easily.",
    min: 0,
    max: 3000,
    step: 10,
    unit: "ms",
  },
  {
    key: "popupUnlockThreshold",
    label: "Popup unlock threshold",
    description:
      "How strong the next motion must be after popup lock before control resumes. Higher values require a more deliberate gesture.",
    min: 0.01,
    max: 4,
    step: 0.01,
    unit: "deg",
  },
];

const tuningPresets: TuningPreset[] = [
  {
    name: "Super Stable",
    description:
      "Maximum damping and stronger stop protection for noisy sensors.",
    settings: {
      bufferSize: 9,
      calibrationSampleCount: 10,
      emaAlpha: 0.12,
      mapUpdateHz: 24,
      maxDeltaPerUpdate: 1.8,
      motionStartThreshold: 0.8,
      motionStopThreshold: 0.18,
      motionSettleDuration: 280,
      motionStopDuration: 700,
      popupHardLockDuration: 1200,
      popupUnlockThreshold: 1.1,
    },
  },
  {
    name: "Balanced",
    description:
      "The default profile for general tuning and first-pass testing.",
    settings: DEFAULT_MOTION_TUNING_SETTINGS,
  },
  {
    name: "Sensitive",
    description:
      "Faster response with lighter filtering for deliberate, agile control.",
    settings: {
      bufferSize: 3,
      calibrationSampleCount: 4,
      emaAlpha: 0.42,
      mapUpdateHz: 45,
      maxDeltaPerUpdate: 5,
      motionStartThreshold: 0.18,
      motionStopThreshold: 0.08,
      motionSettleDuration: 90,
      motionStopDuration: 240,
      popupHardLockDuration: 450,
      popupUnlockThreshold: 0.32,
    },
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundToStep(value: number, step: number) {
  const precision = step.toString().includes(".")
    ? step.toString().split(".")[1].length
    : 0;
  return Number(value.toFixed(precision));
}

const CO2_THRESHOLD_MIN = 300;
const CO2_THRESHOLD_MAX = 10000;
const CO2_THRESHOLD_STEP = 10;

export default function MotionTuningPanel({
  settings,
  diagnostics,
  sensorDebug,
  co2Threshold,
  onChange,
  onCo2ThresholdChange,
  onReset,
  onRecalibrate,
  onSimulateCo2,
  isCo2Simulating = false,
  simulatedCo2Ppm = null,
}: MotionTuningPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const fieldLookup = useMemo(
    () => Object.fromEntries(tuningFields.map((field) => [field.key, field])),
    [],
  ) as Record<keyof MotionTuningSettings, TuningField>;

  function updateSetting(key: keyof MotionTuningSettings, rawValue: number) {
    const field = fieldLookup[key];
    const nextValue = roundToStep(
      clamp(rawValue, field.min, field.max),
      field.step,
    );

    onChange({
      ...settings,
      [key]: nextValue,
    });
  }

  function updateMappingMethod(value: MotionMappingMethod) {
    onChange({
      ...settings,
      mappingMethod: value,
    });
  }

  function updateInversionSetting(
    key: "invertLatitude" | "invertLongitude" | "invertBearing",
    value: boolean,
  ) {
    onChange({
      ...settings,
      [key]: value,
    });
  }

  function updateQuaternionRemap(
    key:
      | "quaternionRemapW"
      | "quaternionRemapX"
      | "quaternionRemapY"
      | "quaternionRemapZ",
    value: SignedQuaternionComponent,
  ) {
    onChange({
      ...settings,
      [key]: value,
    });
  }

  function updateProjectionChannel(
    key:
      | "quaternionLatitudeFrom"
      | "quaternionLongitudeFrom"
      | "quaternionBearingFrom",
    value: QuaternionProjectionChannel,
  ) {
    onChange({
      ...settings,
      [key]: value,
    });
  }

  function resetQuaternionRemap() {
    onChange({
      ...settings,
      quaternionRemapW: "w",
      quaternionRemapX: "y",
      quaternionRemapY: "-x",
      quaternionRemapZ: "z",
      quaternionLatitudeFrom: "latitude",
      quaternionLongitudeFrom: "longitude",
      quaternionBearingFrom: "bearing",
    });
  }

  function applyPreset(preset: TuningPreset) {
    onChange({ ...settings, ...preset.settings });
  }

  function updateCo2Threshold(rawValue: number) {
    const nextValue = roundToStep(
      clamp(rawValue, CO2_THRESHOLD_MIN, CO2_THRESHOLD_MAX),
      CO2_THRESHOLD_STEP,
    );
    onCo2ThresholdChange(nextValue);
  }

  return (
    <>
      <div className="absolute right-4 bottom-4 z-20 pointer-events-auto">
        {isOpen ? (
          createPortal(
            <div className="absolute right-4 bottom-4 z-20 pointer-events-auto">
              <Card className="w-[340px] max-h-[70vh] overflow-hidden bg-white/95 backdrop-blur">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Motion Tuning</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Values apply live. Use recalibrate to zero the current
                        globe pose without reconnecting Bluetooth.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsOpen(false)}
                    >
                      Close
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 overflow-y-auto max-h-[calc(70vh-88px)]">
                  <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      CO2 Trigger
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label
                          className="text-sm font-medium"
                          htmlFor="co2Threshold"
                        >
                          CO2 threshold
                        </label>
                        <div className="flex items-center gap-2 w-[124px]">
                          <Input
                            id="co2Threshold"
                            type="number"
                            value={co2Threshold}
                            min={CO2_THRESHOLD_MIN}
                            max={CO2_THRESHOLD_MAX}
                            step={CO2_THRESHOLD_STEP}
                            className="h-8"
                            onChange={(event) =>
                              updateCo2Threshold(Number(event.target.value))
                            }
                          />
                          <span className="text-xs text-muted-foreground w-8 text-right">
                            ppm
                          </span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={CO2_THRESHOLD_MIN}
                        max={CO2_THRESHOLD_MAX}
                        step={CO2_THRESHOLD_STEP}
                        value={co2Threshold}
                        onChange={(event) =>
                          updateCo2Threshold(Number(event.target.value))
                        }
                        className="w-full accent-emerald-600"
                      />
                      <p className="text-xs text-slate-500 leading-relaxed">
                        The composition opens when CO2 is above this value, and
                        returns to the map when CO2 drops below it.
                      </p>
                      {onSimulateCo2 && (
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={isCo2Simulating ? "secondary" : "outline"}
                            disabled={isCo2Simulating}
                            onClick={onSimulateCo2}
                            className="flex"
                          >
                            {isCo2Simulating
                              ? `Simulating… ${simulatedCo2Ppm != null ? `${simulatedCo2Ppm} ppm` : ""}`
                              : `Simulate CO2 spike (${co2Threshold + 500} → ${co2Threshold} / 30 s)`}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Presets
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {tuningPresets.map((preset) => {
                        const isActive = Object.entries(preset.settings).every(
                          ([key, value]) =>
                            settings[key as keyof MotionTuningSettings] ===
                            value,
                        );

                        return (
                          <button
                            key={preset.name}
                            type="button"
                            onClick={() => applyPreset(preset)}
                            className={`rounded-md border px-3 py-2 text-left transition-colors ${
                              isActive
                                ? "border-sky-300 bg-sky-50"
                                : "bg-white hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">
                                {preset.name}
                              </span>
                              {isActive && (
                                <span className="text-[11px] font-medium uppercase tracking-wide text-sky-700">
                                  Active
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {preset.description}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-md border bg-slate-50 p-3 space-y-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Mapping Method
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {mappingMethods.map((method) => {
                        const isActive =
                          settings.mappingMethod === method.value;
                        return (
                          <button
                            key={method.value}
                            type="button"
                            onClick={() => updateMappingMethod(method.value)}
                            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                              isActive
                                ? "border-sky-300 bg-sky-50 text-sky-900"
                                : "bg-white hover:bg-slate-50"
                            }`}
                          >
                            {method.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Quaternion maps orientation directly from IMU quaternions.
                      Euler uses the legacy angle-based transform.
                    </p>

                    {settings.mappingMethod === "quaternion" && (
                      <div className="space-y-2 rounded-md bg-white border border-sky-100 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Quaternion Mapping
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={resetQuaternionRemap}
                              className="h-7 text-xs"
                            >
                              Reset Mapping
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={onRecalibrate}
                              className="h-7 text-xs"
                            >
                              Calibrate
                            </Button>
                          </div>
                        </div>

                        <div className="rounded bg-slate-50 p-2 border border-slate-200 space-y-1.5">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                            Relative Quaternion (w,x,y,z)
                          </div>
                          <div className="grid grid-cols-4 gap-1 text-xs">
                            {sensorDebug.relativeQuaternion ? (
                              <>
                                <div className="bg-white px-1.5 py-1 rounded border border-slate-300 text-center font-mono">
                                  <div className="text-[9px] text-slate-500">
                                    w
                                  </div>
                                  <div>
                                    {sensorDebug.relativeQuaternion.w.toFixed(
                                      3,
                                    )}
                                  </div>
                                </div>
                                <div className="bg-white px-1.5 py-1 rounded border border-slate-300 text-center font-mono">
                                  <div className="text-[9px] text-slate-500">
                                    x
                                  </div>
                                  <div>
                                    {sensorDebug.relativeQuaternion.x.toFixed(
                                      3,
                                    )}
                                  </div>
                                </div>
                                <div className="bg-white px-1.5 py-1 rounded border border-slate-300 text-center font-mono">
                                  <div className="text-[9px] text-slate-500">
                                    y
                                  </div>
                                  <div>
                                    {sensorDebug.relativeQuaternion.y.toFixed(
                                      3,
                                    )}
                                  </div>
                                </div>
                                <div className="bg-white px-1.5 py-1 rounded border border-slate-300 text-center font-mono">
                                  <div className="text-[9px] text-slate-500">
                                    z
                                  </div>
                                  <div>
                                    {sensorDebug.relativeQuaternion.z.toFixed(
                                      3,
                                    )}
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="col-span-4 text-[11px] text-slate-400 text-center py-1">
                                Waiting for quaternion data...
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded bg-slate-50 p-2 border border-slate-200 space-y-2">
                          <p className="text-[10px] text-slate-500 leading-tight">
                            Manual remap is enabled. Reset Mapping restores your
                            mounted baseline: face up, rotated 90 degrees
                            counter-clockwise.
                          </p>
                        </div>

                        <div className="rounded bg-slate-50 p-2 border border-slate-200 space-y-2">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                            Quaternion Component Remap
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <label className="space-y-1">
                              <span className="text-slate-600">Output w</span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionRemapW}
                                onChange={(event) =>
                                  updateQuaternionRemap(
                                    "quaternionRemapW",
                                    event.target
                                      .value as SignedQuaternionComponent,
                                  )
                                }
                              >
                                {signedQuaternionComponentOptions.map(
                                  (option) => (
                                    <option
                                      key={`qremap-w-${option.value}`}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-slate-600">Output x</span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionRemapX}
                                onChange={(event) =>
                                  updateQuaternionRemap(
                                    "quaternionRemapX",
                                    event.target
                                      .value as SignedQuaternionComponent,
                                  )
                                }
                              >
                                {signedQuaternionComponentOptions.map(
                                  (option) => (
                                    <option
                                      key={`qremap-x-${option.value}`}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-slate-600">Output y</span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionRemapY}
                                onChange={(event) =>
                                  updateQuaternionRemap(
                                    "quaternionRemapY",
                                    event.target
                                      .value as SignedQuaternionComponent,
                                  )
                                }
                              >
                                {signedQuaternionComponentOptions.map(
                                  (option) => (
                                    <option
                                      key={`qremap-y-${option.value}`}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-slate-600">Output z</span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionRemapZ}
                                onChange={(event) =>
                                  updateQuaternionRemap(
                                    "quaternionRemapZ",
                                    event.target
                                      .value as SignedQuaternionComponent,
                                  )
                                }
                              >
                                {signedQuaternionComponentOptions.map(
                                  (option) => (
                                    <option
                                      key={`qremap-z-${option.value}`}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                          </div>
                        </div>

                        <div className="rounded bg-slate-50 p-2 border border-slate-200 space-y-2">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                            Map Axis Remap
                          </div>
                          <div className="grid grid-cols-1 gap-2 text-xs">
                            <label className="space-y-1">
                              <span className="text-slate-600">
                                Latitude comes from
                              </span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionLatitudeFrom}
                                onChange={(event) =>
                                  updateProjectionChannel(
                                    "quaternionLatitudeFrom",
                                    event.target
                                      .value as QuaternionProjectionChannel,
                                  )
                                }
                              >
                                {projectionChannelOptions.map((option) => (
                                  <option
                                    key={`qproj-lat-${option.value}`}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-slate-600">
                                Longitude comes from
                              </span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionLongitudeFrom}
                                onChange={(event) =>
                                  updateProjectionChannel(
                                    "quaternionLongitudeFrom",
                                    event.target
                                      .value as QuaternionProjectionChannel,
                                  )
                                }
                              >
                                {projectionChannelOptions.map((option) => (
                                  <option
                                    key={`qproj-lng-${option.value}`}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-slate-600">
                                Bearing comes from
                              </span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionBearingFrom}
                                onChange={(event) =>
                                  updateProjectionChannel(
                                    "quaternionBearingFrom",
                                    event.target
                                      .value as QuaternionProjectionChannel,
                                  )
                                }
                              >
                                {projectionChannelOptions.map((option) => (
                                  <option
                                    key={`qproj-bearing-${option.value}`}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>

                        <div className="rounded bg-slate-50 p-2 border border-slate-200 space-y-1.5">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                            Current Projection
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-xs">
                            <div className="bg-white px-2 py-1 rounded border border-slate-300">
                              <div className="text-[9px] text-slate-500">
                                Latitude
                              </div>
                              <div className="font-mono">
                                {sensorDebug.quaternionProjection
                                  ? `${sensorDebug.quaternionProjection.latitude.toFixed(1)}°`
                                  : "--"}
                              </div>
                            </div>
                            <div className="bg-white px-2 py-1 rounded border border-slate-300">
                              <div className="text-[9px] text-slate-500">
                                Longitude
                              </div>
                              <div className="font-mono">
                                {sensorDebug.quaternionProjection
                                  ? `${sensorDebug.quaternionProjection.longitude.toFixed(1)}°`
                                  : "--"}
                              </div>
                            </div>
                            <div className="bg-white px-2 py-1 rounded border border-slate-300">
                              <div className="text-[9px] text-slate-500">
                                Bearing
                              </div>
                              <div className="font-mono">
                                {sensorDebug.quaternionProjection
                                  ? `${sensorDebug.quaternionProjection.bearing.toFixed(1)}°`
                                  : "--"}
                              </div>
                            </div>
                          </div>
                        </div>

                        {!diagnostics.calibrated && (
                          <div className="text-[11px] text-slate-500 text-center py-1">
                            Connect Bluetooth and calibration will establish on
                            first sensor packet.
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Axis Inversion
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateInversionSetting(
                              "invertLatitude",
                              !settings.invertLatitude,
                            )
                          }
                          className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                            settings.invertLatitude
                              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                              : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          Lat
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateInversionSetting(
                              "invertLongitude",
                              !settings.invertLongitude,
                            )
                          }
                          className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                            settings.invertLongitude
                              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                              : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          Lng
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateInversionSetting(
                              "invertBearing",
                              !settings.invertBearing,
                            )
                          }
                          className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                            settings.invertBearing
                              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                              : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          Bearing
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Motion Diagnostics
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          diagnostics.popupLocked
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {diagnostics.popupLocked
                          ? "Popup Locked"
                          : "Popup Free"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded bg-white px-2 py-1.5 border">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Phase
                        </div>
                        <div className="font-medium capitalize">
                          {diagnostics.phase}
                        </div>
                      </div>
                      <div className="rounded bg-white px-2 py-1.5 border">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Motion
                        </div>
                        <div className="font-medium">
                          {diagnostics.motionMagnitude.toFixed(3)} deg
                        </div>
                      </div>
                      <div className="rounded bg-white px-2 py-1.5 border">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Calibrated
                        </div>
                        <div className="font-medium">
                          {diagnostics.calibrated ? "Yes" : "No"}
                        </div>
                      </div>
                      <div className="rounded bg-white px-2 py-1.5 border">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Lock Remaining
                        </div>
                        <div className="font-medium">
                          {Math.round(diagnostics.popupLockRemainingMs)} ms
                        </div>
                      </div>
                    </div>
                  </div>

                  {tuningFields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <label
                            className="text-sm font-medium"
                            htmlFor={field.key}
                          >
                            {field.label}
                          </label>
                          <div className="group relative inline-flex items-center">
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 hover:text-slate-700"
                              aria-label={`More information about ${field.label}`}
                            >
                              <span className="text-[11px] font-bold leading-none">
                                ?
                              </span>
                            </button>
                            <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-md border bg-white p-2 text-xs leading-relaxed text-slate-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                              {field.description}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-[124px]">
                          <Input
                            id={field.key}
                            type="number"
                            value={settings[field.key]}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            className="h-8"
                            onChange={(event) =>
                              updateSetting(
                                field.key,
                                Number(event.target.value),
                              )
                            }
                          />
                          <span className="text-xs text-muted-foreground w-8 text-right">
                            {field.unit ?? ""}
                          </span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={settings[field.key]}
                        onChange={(event) =>
                          updateSetting(field.key, Number(event.target.value))
                        }
                        className="w-full accent-blue-600"
                      />
                    </div>
                  ))}

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onReset}
                      className="flex-1"
                    >
                      Reset Defaults
                    </Button>
                    <Button
                      type="button"
                      onClick={onRecalibrate}
                      className="flex-1"
                    >
                      Recalibrate
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>,
            document.body,
          )
        ) : (
          <Button
            type="button"
            variant="outline"
            className="bg-white/95 backdrop-blur"
            onClick={() => setIsOpen(true)}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Tune Motion
          </Button>
        )}
      </div>
    </>
  );
}
