"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PatchLogSource =
  | "lat"
  | "lng"
  | "accX"
  | "accY"
  | "accZ"
  | "co2"
  | "sensorList"
  | "system";

export type Pd4WebPatchLogEntry = {
  id: number;
  timestamp: number;
  source: PatchLogSource;
  receiver: string;
  value: number | null;
  delta: number | null;
  threshold: number | null;
  message?: string;
};

export type Pd4WebPatchLogControls = {
  pollMs: number;
  epsilon: number;
  accEpsilon: number;
  alwaysSendMovement: boolean;
};

type Pd4WebPatchLogProps = {
  isEnabled: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  controls: Pd4WebPatchLogControls;
  onControlsChange: (controls: Pd4WebPatchLogControls) => void;
  logs: Pd4WebPatchLogEntry[];
  onClearLogs: () => void;
  patchLabel: string;
};

const POLL_MS_MIN = 16;
const POLL_MS_MAX = 2000;
const EPSILON_MIN = 0;
const EPSILON_MAX = 100;
const ACC_EPSILON_MAX = 100;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function formatValue(value: number | null) {
  if (value === null) {
    return "-";
  }
  return value.toFixed(5);
}

function formatDelta(delta: number | null) {
  if (delta === null) {
    return "-";
  }
  return delta.toFixed(5);
}

function formatThreshold(threshold: number | null) {
  if (threshold === null) {
    return "-";
  }
  return threshold.toFixed(5);
}

export default function Pd4WebPatchLog({
  isEnabled,
  isOpen,
  onOpenChange,
  controls,
  onControlsChange,
  logs,
  onClearLogs,
  patchLabel,
}: Pd4WebPatchLogProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isEnabled) {
    return null;
  }

  if (!isMounted) {
    return null;
  }

  function updatePollMs(rawValue: string) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }

    onControlsChange({
      ...controls,
      pollMs: Math.round(clamp(parsed, POLL_MS_MIN, POLL_MS_MAX)),
    });
  }

  function updateEpsilon(rawValue: string) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }

    onControlsChange({
      ...controls,
      epsilon: clamp(parsed, EPSILON_MIN, EPSILON_MAX),
    });
  }

  function updateAccEpsilon(rawValue: string) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }

    onControlsChange({
      ...controls,
      accEpsilon: clamp(parsed, EPSILON_MIN, ACC_EPSILON_MAX),
    });
  }

  function updateAlwaysSendMovement(value: boolean) {
    onControlsChange({
      ...controls,
      alwaysSendMovement: value,
    });
  }

  return createPortal(
    <div className="fixed left-3 bottom-28 z-50 pointer-events-auto">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant={isOpen ? "secondary" : "outline"}
          className="h-7 px-2 text-[11px]"
          onClick={() => onOpenChange(!isOpen)}
        >
          Log Patch
        </Button>
        {isOpen ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={onClearLogs}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {isOpen ? (
        <Card className="mt-1 w-[292px] max-w-[calc(100vw-1rem)] bg-white/95 backdrop-blur">
          <CardHeader className="px-2.5 pt-2.5 pb-1.5">
            <div className="flex items-start justify-between gap-1.5">
              <div>
                <CardTitle className="text-xs leading-tight">
                  Patch Log: {patchLabel}
                </CardTitle>
                <p className="mt-0.5 text-[10px] leading-3 text-muted-foreground">
                  Outgoing map movement events to the Pd patch. Controls apply
                  in real time.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px]"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 px-2.5 pb-2.5 pt-0">
            <div className="grid grid-cols-2 gap-1.5 rounded-md border bg-slate-50 p-1.5">
              <div className="space-y-0.5">
                <label
                  className="text-[10px] font-medium text-slate-700"
                  htmlFor="patchLogPollMs"
                >
                  pollMs
                </label>
                <Input
                  id="patchLogPollMs"
                  type="number"
                  min={POLL_MS_MIN}
                  max={POLL_MS_MAX}
                  step={1}
                  value={controls.pollMs}
                  className="h-6 px-2 text-[11px]"
                  onChange={(event) => updatePollMs(event.target.value)}
                />
              </div>

              <div className="space-y-0.5">
                <label
                  className="text-[10px] font-medium text-slate-700"
                  htmlFor="patchLogEpsilon"
                >
                  epsilon
                </label>
                <Input
                  id="patchLogEpsilon"
                  type="number"
                  min={EPSILON_MIN}
                  max={EPSILON_MAX}
                  step={0.01}
                  value={controls.epsilon}
                  className="h-6 px-2 text-[11px]"
                  onChange={(event) => updateEpsilon(event.target.value)}
                />
              </div>

              <div className="space-y-0.5">
                <label
                  className="text-[10px] font-medium text-slate-700"
                  htmlFor="patchLogAccEpsilon"
                >
                  accEpsilon
                </label>
                <Input
                  id="patchLogAccEpsilon"
                  type="number"
                  min={EPSILON_MIN}
                  max={ACC_EPSILON_MAX}
                  step={0.01}
                  value={controls.accEpsilon}
                  className="h-6 px-2 text-[11px]"
                  onChange={(event) => updateAccEpsilon(event.target.value)}
                />
              </div>

              <label
                className="col-span-2 mt-0.5 flex items-center gap-1 text-[10px] font-medium leading-3 text-slate-700"
                htmlFor="patchLogAlwaysSendMovement"
              >
                <input
                  id="patchLogAlwaysSendMovement"
                  type="checkbox"
                  className="h-3 w-3"
                  checked={controls.alwaysSendMovement}
                  onChange={(event) =>
                    updateAlwaysSendMovement(event.target.checked)
                  }
                />
                Always send map movement data at pollMs frequency
              </label>
            </div>

            <div className="rounded-md border">
              <div className="border-b bg-slate-50 px-1.5 py-1 text-[10px] font-medium text-slate-600">
                Latest Sends ({logs.length})
              </div>
              <div className="max-h-32 overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="px-1.5 py-1.5 text-[10px] text-slate-500">
                    No map movement events yet.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {logs.map((entry) => (
                      <li
                        key={entry.id}
                        className="px-1.5 py-1 text-[9px] leading-3 font-mono"
                      >
                        {entry.source === "system" ? (
                          <div className="text-slate-600">
                            [{formatTimestamp(entry.timestamp)}]{" "}
                            {entry.message ?? "system event"}
                          </div>
                        ) : (
                          <>
                            <div className="text-slate-700">
                              [{formatTimestamp(entry.timestamp)}]{" "}
                              {entry.source} -&gt; {entry.receiver}
                            </div>
                            <div className="text-slate-500">
                              value={formatValue(entry.value)} delta=
                              {formatDelta(entry.delta)} threshold=
                              {formatThreshold(entry.threshold)}
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>,
    document.body,
  );
}
