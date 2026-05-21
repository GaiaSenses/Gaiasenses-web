import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl";

type Quaternion = {
  w: number;
  x: number;
  y: number;
  z: number;
};

export type SignedQuaternionComponent =
  | "w"
  | "x"
  | "y"
  | "z"
  | "-w"
  | "-x"
  | "-y"
  | "-z";

export type QuaternionProjectionChannel = "latitude" | "longitude" | "bearing";

type ProjectionAngles = {
  latitude: number;
  longitude: number;
  bearing: number;
};

type EulerAngles = {
  yaw: number;
  pitch: number;
  roll: number;
};

export type SensorDebugSnapshot = {
  rawEuler: EulerAngles | null;
  relativeEuler: EulerAngles | null;
  relativeQuaternion: Quaternion | null;
  quaternionProjection: ProjectionAngles | null;
  smoothedEuler: {
    alpha: number;
    beta: number;
    gamma: number;
  };
  acceleration: {
    x: number | null;
    y: number | null;
    z: number | null;
  } | null;
};

type MotionPhase = "calibrating" | "idle" | "moving" | "settling" | "stopped";

export type MotionDiagnostics = {
  phase: MotionPhase;
  motionMagnitude: number;
  popupLocked: boolean;
  popupLockRemainingMs: number;
  calibrated: boolean;
};

export type MotionMappingMethod = "euler" | "quaternion";

export type MotionTuningSettings = {
  bufferSize: number;
  calibrationSampleCount: number;
  emaAlpha: number;
  mapUpdateHz: number;
  maxDeltaPerUpdate: number;
  motionStartThreshold: number;
  motionStopThreshold: number;
  motionSettleDuration: number;
  motionStopDuration: number;
  popupHardLockDuration: number;
  popupUnlockThreshold: number;
  mappingMethod: MotionMappingMethod;
  invertLatitude: boolean;
  invertLongitude: boolean;
  invertBearing: boolean;
  quaternionRemapW: SignedQuaternionComponent;
  quaternionRemapX: SignedQuaternionComponent;
  quaternionRemapY: SignedQuaternionComponent;
  quaternionRemapZ: SignedQuaternionComponent;
  quaternionLatitudeFrom: QuaternionProjectionChannel;
  quaternionLongitudeFrom: QuaternionProjectionChannel;
  quaternionBearingFrom: QuaternionProjectionChannel;
};

export const DEFAULT_MOTION_TUNING_SETTINGS: MotionTuningSettings = {
  bufferSize: 5,
  calibrationSampleCount: 6,
  emaAlpha: 0.24,
  mapUpdateHz: 30,
  maxDeltaPerUpdate: 3,
  motionStartThreshold: 0.45,
  motionStopThreshold: 0.12,
  motionSettleDuration: 160,
  motionStopDuration: 420,
  popupHardLockDuration: 850,
  popupUnlockThreshold: 0.85,
  mappingMethod: "quaternion",
  invertLatitude: false,
  invertLongitude: false,
  invertBearing: false,
  quaternionRemapW: "w",
  quaternionRemapX: "y",
  quaternionRemapY: "-x",
  quaternionRemapZ: "z",
  quaternionLatitudeFrom: "latitude",
  quaternionLongitudeFrom: "longitude",
  quaternionBearingFrom: "bearing",
};

const DEFAULT_MOTION_DIAGNOSTICS: MotionDiagnostics = {
  phase: "calibrating",
  motionMagnitude: 0,
  popupLocked: false,
  popupLockRemainingMs: 0,
  calibrated: false,
};

const DEFAULT_SENSOR_DEBUG_SNAPSHOT: SensorDebugSnapshot = {
  rawEuler: null,
  relativeEuler: null,
  relativeQuaternion: null,
  quaternionProjection: null,
  smoothedEuler: {
    alpha: 0,
    beta: 0,
    gamma: 0,
  },
  acceleration: null,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function median(values: number[]) {
  const arr = [...values].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeAngle(value: number) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function shortestAngleDelta(target: number, current: number) {
  return normalizeAngle(target - current);
}

function unwrapAngle(nextAngle: number, previousAngle: number | null) {
  if (previousAngle === null) {
    return nextAngle;
  }

  return (
    previousAngle + shortestAngleDelta(nextAngle, normalizeAngle(previousAngle))
  );
}

function quatToEuler(q: Quaternion): EulerAngles {
  const { w, x, y, z } = q;
  const ysqr = y * y;

  const t0 = 2 * (w * x + y * z);
  const t1 = 1 - 2 * (x * x + ysqr);
  const roll = Math.atan2(t0, t1) * (180 / Math.PI);

  const t2 = clamp(2 * (w * y - z * x), -1, 1);
  const pitch = Math.asin(t2) * (180 / Math.PI);

  const t3 = 2 * (w * z + x * y);
  const t4 = 1 - 2 * (ysqr + z * z);
  const yaw = Math.atan2(t3, t4) * (180 / Math.PI);

  return { yaw, pitch, roll };
}

function normalizeQuaternion(q: Quaternion): Quaternion {
  const length = Math.hypot(q.w, q.x, q.y, q.z) || 1;
  return {
    w: q.w / length,
    x: q.x / length,
    y: q.y / length,
    z: q.z / length,
  };
}

function dotQuaternion(a: Quaternion, b: Quaternion) {
  return a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
}

function multiplyQuaternion(a: Quaternion, b: Quaternion): Quaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

function invertQuaternion(q: Quaternion): Quaternion {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
}

function averageQuaternions(samples: Quaternion[]) {
  if (samples.length === 0) {
    return null;
  }

  const reference = samples[0];
  let sum = { w: 0, x: 0, y: 0, z: 0 };

  for (const sample of samples) {
    const aligned =
      dotQuaternion(reference, sample) < 0
        ? {
            w: -sample.w,
            x: -sample.x,
            y: -sample.y,
            z: -sample.z,
          }
        : sample;

    sum = {
      w: sum.w + aligned.w,
      x: sum.x + aligned.x,
      y: sum.y + aligned.y,
      z: sum.z + aligned.z,
    };
  }

  return normalizeQuaternion(sum);
}

function readSensorSample(data: any): {
  quaternion: Quaternion | null;
  euler: EulerAngles | null;
} {
  const quat = data?.quat;
  const quaternion =
    quat &&
    isFiniteNumber(quat.quat_w) &&
    isFiniteNumber(quat.quat_x) &&
    isFiniteNumber(quat.quat_y) &&
    isFiniteNumber(quat.quat_z)
      ? normalizeQuaternion({
          w: quat.quat_w,
          x: quat.quat_x,
          y: quat.quat_y,
          z: quat.quat_z,
        })
      : null;

  const rawYaw = Number(data?.euler?.yaw);
  const rawPitch = Number(data?.euler?.pitch);
  const rawRoll = Number(data?.euler?.roll);
  const euler =
    Number.isFinite(rawYaw) &&
    Number.isFinite(rawPitch) &&
    Number.isFinite(rawRoll)
      ? {
          yaw: normalizeAngle(rawYaw),
          pitch: rawPitch,
          roll: rawRoll,
        }
      : quaternion
        ? quatToEuler(quaternion)
        : null;

  return { quaternion, euler };
}

function getRelativeEuler(
  quaternion: Quaternion | null,
  baselineQuaternion: Quaternion | null,
  euler: EulerAngles | null,
  baselineEuler: EulerAngles | null,
  previousAngles: EulerAngles | null,
): EulerAngles | null {
  if (quaternion && baselineQuaternion) {
    const delta = multiplyQuaternion(
      invertQuaternion(baselineQuaternion),
      quaternion,
    );
    const relative = quatToEuler(normalizeQuaternion(delta));

    return {
      yaw: unwrapAngle(
        normalizeAngle(relative.yaw),
        previousAngles?.yaw ?? null,
      ),
      pitch: relative.pitch,
      roll: relative.roll,
    };
  }

  if (euler && baselineEuler) {
    return {
      yaw: unwrapAngle(
        normalizeAngle(euler.yaw - baselineEuler.yaw),
        previousAngles?.yaw ?? null,
      ),
      pitch: euler.pitch - baselineEuler.pitch,
      roll: euler.roll - baselineEuler.roll,
    };
  }

  return null;
}

function getSignedQuaternionComponent(
  source: SignedQuaternionComponent,
  q: Quaternion,
) {
  const isNegative = source.startsWith("-");
  const key = (isNegative ? source.slice(1) : source) as keyof Quaternion;
  const value = q[key];
  return isNegative ? -value : value;
}

function remapQuaternion(
  relativeQuaternion: Quaternion,
  tuning: MotionTuningSettings,
) {
  return normalizeQuaternion({
    w: getSignedQuaternionComponent(
      tuning.quaternionRemapW,
      relativeQuaternion,
    ),
    x: getSignedQuaternionComponent(
      tuning.quaternionRemapX,
      relativeQuaternion,
    ),
    y: getSignedQuaternionComponent(
      tuning.quaternionRemapY,
      relativeQuaternion,
    ),
    z: getSignedQuaternionComponent(
      tuning.quaternionRemapZ,
      relativeQuaternion,
    ),
  });
}

function readProjectionChannel(
  projection: ProjectionAngles,
  source: QuaternionProjectionChannel,
) {
  return projection[source];
}

function getQuaternionProjection(
  relativeQuaternion: Quaternion,
  tuning: MotionTuningSettings,
) {
  const { w, x, y, z } = remapQuaternion(relativeQuaternion, tuning);
  const vx = 2 * (x * z + w * y);
  const vy = 2 * (y * z - w * x);
  const vz = 1 - 2 * (x * x + y * y);

  const rawProjection: ProjectionAngles = {
    longitude: normalizeAngle((Math.atan2(vx, vz) * 180) / Math.PI),
    latitude: clamp((Math.asin(clamp(vy, -1, 1)) * 180) / Math.PI, -85, 85),
    bearing: normalizeAngle(
      (Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * 180) /
        Math.PI,
    ),
  };

  const latitude = clamp(
    readProjectionChannel(rawProjection, tuning.quaternionLatitudeFrom),
    -85,
    85,
  );
  const longitude = normalizeAngle(
    readProjectionChannel(rawProjection, tuning.quaternionLongitudeFrom),
  );
  const bearing = normalizeAngle(
    readProjectionChannel(rawProjection, tuning.quaternionBearingFrom),
  );

  return { latitude, longitude, bearing };
}

export function useSensorSmoothing(
  mapRef: React.RefObject<MapRef>,
  onMotionStop?: () => void,
  tuning: MotionTuningSettings = DEFAULT_MOTION_TUNING_SETTINGS,
) {
  const searchParams = useSearchParams();
  const tuningRef = useRef(tuning);
  const [diagnostics, setDiagnostics] = useState<MotionDiagnostics>(
    DEFAULT_MOTION_DIAGNOSTICS,
  );
  const [sensorDebug, setSensorDebug] = useState<SensorDebugSnapshot>(
    DEFAULT_SENSOR_DEBUG_SNAPSHOT,
  );
  const sensorBufferRef = useRef<EulerAngles[]>([]);
  const calibrationBufferRef = useRef<Quaternion[]>([]);
  const sensorSmoothedRef = useRef<{
    alpha: number;
    beta: number;
    gamma: number;
  }>({
    alpha: 0,
    beta: 0,
    gamma: 0,
  });
  const baselineQuaternionRef = useRef<Quaternion | null>(null);
  const baselineEulerRef = useRef<EulerAngles | null>(null);
  const latestRelativeQuaternionRef = useRef<Quaternion | null>(null);
  const lastRelativeAnglesRef = useRef<EulerAngles | null>(null);
  const motionPhaseRef = useRef<MotionPhase>("calibrating");
  const lowMotionStartTimeRef = useRef<number | null>(null);
  const popupLockUntilRef = useRef(0);
  const hasMovedSinceCalibrationRef = useRef(false);
  const callbackFiredRef = useRef(false);
  const requiresStrongUnlockRef = useRef(false);
  const lastMotionMagnitudeRef = useRef(0);

  useEffect(() => {
    tuningRef.current = tuning;
    sensorBufferRef.current = sensorBufferRef.current.slice(-tuning.bufferSize);
    calibrationBufferRef.current = calibrationBufferRef.current.slice(
      -tuning.calibrationSampleCount,
    );
  }, [tuning]);

  const syncDiagnostics = useCallback((now: number, motionMagnitude = 0) => {
    lastMotionMagnitudeRef.current = motionMagnitude;
    const popupLockRemainingMs = Math.max(0, popupLockUntilRef.current - now);
    setDiagnostics((current) => {
      const next: MotionDiagnostics = {
        phase: motionPhaseRef.current,
        motionMagnitude,
        popupLocked: popupLockRemainingMs > 0,
        popupLockRemainingMs,
        calibrated: Boolean(
          baselineQuaternionRef.current || baselineEulerRef.current,
        ),
      };

      if (
        current.phase === next.phase &&
        Math.abs(current.motionMagnitude - next.motionMagnitude) < 0.001 &&
        current.popupLocked === next.popupLocked &&
        Math.abs(current.popupLockRemainingMs - next.popupLockRemainingMs) <
          16 &&
        current.calibrated === next.calibrated
      ) {
        return current;
      }

      return next;
    });
  }, []);

  const resetCalibration = useCallback(() => {
    sensorBufferRef.current = [];
    calibrationBufferRef.current = [];
    sensorSmoothedRef.current = { alpha: 0, beta: 0, gamma: 0 };
    baselineQuaternionRef.current = null;
    baselineEulerRef.current = null;
    latestRelativeQuaternionRef.current = null;
    lastRelativeAnglesRef.current = null;
    motionPhaseRef.current = "calibrating";
    lowMotionStartTimeRef.current = null;
    popupLockUntilRef.current = 0;
    hasMovedSinceCalibrationRef.current = false;
    callbackFiredRef.current = false;
    requiresStrongUnlockRef.current = false;
    lastMotionMagnitudeRef.current = 0;
    setDiagnostics(DEFAULT_MOTION_DIAGNOSTICS);
    setSensorDebug(DEFAULT_SENSOR_DEBUG_SNAPSHOT);
  }, []);

  const handleOnSensor = useCallback(
    (data: any) => {
      if (!data) {
        return;
      }

      const now = performance.now();
      const currentTuning = tuningRef.current;
      const { quaternion, euler } = readSensorSample(data);
      const acceleration = {
        x: isFiniteNumber(data?.acc?.x) ? data.acc.x : null,
        y: isFiniteNumber(data?.acc?.y) ? data.acc.y : null,
        z: isFiniteNumber(data?.acc?.z) ? data.acc.z : null,
      };
      if (!quaternion && !euler) {
        return;
      }

      if (!baselineQuaternionRef.current && !baselineEulerRef.current) {
        if (quaternion) {
          const calibrationBuffer = calibrationBufferRef.current;
          calibrationBuffer.push(quaternion);
          if (calibrationBuffer.length < currentTuning.calibrationSampleCount) {
            return;
          }

          baselineQuaternionRef.current = averageQuaternions(calibrationBuffer);
          calibrationBufferRef.current = [];
        } else if (euler) {
          baselineEulerRef.current = euler;
        }

        motionPhaseRef.current = "idle";
        setSensorDebug({
          rawEuler: euler,
          relativeEuler: null,
          relativeQuaternion: null,
          quaternionProjection: null,
          smoothedEuler: { ...sensorSmoothedRef.current },
          acceleration,
        });
        syncDiagnostics(now, 0);
        return;
      }

      const relative = getRelativeEuler(
        quaternion,
        baselineQuaternionRef.current,
        euler,
        baselineEulerRef.current,
        lastRelativeAnglesRef.current,
      );
      if (!relative) {
        return;
      }

      latestRelativeQuaternionRef.current =
        quaternion && baselineQuaternionRef.current
          ? normalizeQuaternion(
              multiplyQuaternion(
                invertQuaternion(baselineQuaternionRef.current),
                quaternion,
              ),
            )
          : null;

      const previous = lastRelativeAnglesRef.current;
      lastRelativeAnglesRef.current = relative;

      const buffer = sensorBufferRef.current;
      buffer.push(relative);
      if (buffer.length > currentTuning.bufferSize) {
        buffer.shift();
      }

      const medYaw = median(buffer.map((sample) => sample.yaw));
      const medPitch = median(buffer.map((sample) => sample.pitch));
      const medRoll = median(buffer.map((sample) => sample.roll));
      const smoothed = sensorSmoothedRef.current;
      smoothed.alpha += (medYaw - smoothed.alpha) * currentTuning.emaAlpha;
      smoothed.beta += (medPitch - smoothed.beta) * currentTuning.emaAlpha;
      smoothed.gamma += (medRoll - smoothed.gamma) * currentTuning.emaAlpha;

      const quaternionProjection = latestRelativeQuaternionRef.current
        ? getQuaternionProjection(
            latestRelativeQuaternionRef.current,
            currentTuning,
          )
        : null;

      setSensorDebug({
        rawEuler: euler,
        relativeEuler: relative,
        relativeQuaternion: latestRelativeQuaternionRef.current,
        quaternionProjection,
        smoothedEuler: { ...smoothed },
        acceleration,
      });

      if (!previous) {
        syncDiagnostics(now, 0);
        return;
      }

      const deltaYaw = Math.abs(relative.yaw - previous.yaw);
      const deltaPitch = Math.abs(relative.pitch - previous.pitch);
      const deltaRoll = Math.abs(relative.roll - previous.roll);
      const motionMagnitude = Math.max(deltaYaw, deltaPitch, deltaRoll);
      const isPopupLocked = now < popupLockUntilRef.current;

      if (
        motionPhaseRef.current === "idle" ||
        motionPhaseRef.current === "stopped"
      ) {
        const unlockThreshold = requiresStrongUnlockRef.current
          ? currentTuning.popupUnlockThreshold
          : currentTuning.motionStartThreshold;

        if (!isPopupLocked && motionMagnitude >= unlockThreshold) {
          motionPhaseRef.current = "moving";
          lowMotionStartTimeRef.current = null;
          callbackFiredRef.current = false;
          requiresStrongUnlockRef.current = false;
          hasMovedSinceCalibrationRef.current = true;
        }

        syncDiagnostics(now, motionMagnitude);
        return;
      }

      if (motionMagnitude >= currentTuning.motionStartThreshold) {
        motionPhaseRef.current = "moving";
        lowMotionStartTimeRef.current = null;
        callbackFiredRef.current = false;
        hasMovedSinceCalibrationRef.current = true;
        syncDiagnostics(now, motionMagnitude);
        return;
      }

      if (motionMagnitude <= currentTuning.motionStopThreshold) {
        if (lowMotionStartTimeRef.current === null) {
          lowMotionStartTimeRef.current = now;
        }

        const lowMotionDuration = now - lowMotionStartTimeRef.current;
        if (lowMotionDuration >= currentTuning.motionSettleDuration) {
          motionPhaseRef.current = "settling";
        }

        if (
          lowMotionDuration >= currentTuning.motionStopDuration &&
          hasMovedSinceCalibrationRef.current &&
          !callbackFiredRef.current
        ) {
          motionPhaseRef.current = "stopped";
          popupLockUntilRef.current = now + currentTuning.popupHardLockDuration;
          callbackFiredRef.current = true;
          requiresStrongUnlockRef.current = true;
          onMotionStop?.();
        }

        syncDiagnostics(now, motionMagnitude);
        return;
      }

      motionPhaseRef.current = "moving";
      lowMotionStartTimeRef.current = null;
      syncDiagnostics(now, motionMagnitude);
    },
    [onMotionStop, syncDiagnostics],
  );

  useEffect(() => {
    let raf = 0;
    let lastMapUpdate = 0;

    function step() {
      const now = performance.now();
      const sensorBuffer = sensorBufferRef.current;
      const currentTuning = tuningRef.current;
      const mapUpdateMs = 1000 / Math.max(currentTuning.mapUpdateHz, 1);

      syncDiagnostics(now, lastMotionMagnitudeRef.current);

      if (
        sensorBuffer.length > 0 &&
        motionPhaseRef.current === "moving" &&
        searchParams.get("mode") === "map" &&
        mapRef.current
      ) {
        const smoothed = sensorSmoothedRef.current;

        if (now - lastMapUpdate >= mapUpdateMs) {
          lastMapUpdate = now;

          const useQuaternionProjection =
            currentTuning.mappingMethod === "quaternion";

          let latitude: number;
          let targetLongitude: number;
          let targetBearing: number | null = null;

          const relativeQuaternion = latestRelativeQuaternionRef.current;
          if (useQuaternionProjection) {
            if (!relativeQuaternion) {
              raf = requestAnimationFrame(step);
              return;
            }

            const projection = getQuaternionProjection(
              relativeQuaternion,
              currentTuning,
            );
            latitude = projection.latitude;
            targetLongitude = projection.longitude;
            targetBearing = -projection.bearing;
          } else {
            const yawRad = (smoothed.alpha * Math.PI) / 180;
            latitude = clamp(
              -(
                smoothed.beta * Math.cos(yawRad) -
                smoothed.gamma * Math.sin(yawRad)
              ),
              -85,
              85,
            );
            targetLongitude = normalizeAngle(-smoothed.alpha);
          }

          if (currentTuning.invertLatitude) {
            latitude = -latitude;
          }
          latitude = clamp(latitude, -85, 85);

          if (currentTuning.invertLongitude) {
            targetLongitude = normalizeAngle(-targetLongitude);
          }

          if (targetBearing !== null && currentTuning.invertBearing) {
            targetBearing = normalizeAngle(-targetBearing);
          }

          const center = mapRef.current.getCenter();
          const latitudeDelta = latitude - center.lat;
          const longitudeDelta = shortestAngleDelta(
            targetLongitude,
            center.lng,
          );

          const clampedLat =
            Math.abs(latitudeDelta) > currentTuning.maxDeltaPerUpdate
              ? center.lat +
                Math.sign(latitudeDelta) * currentTuning.maxDeltaPerUpdate
              : latitude;
          const clampedLng =
            Math.abs(longitudeDelta) > currentTuning.maxDeltaPerUpdate
              ? center.lng +
                Math.sign(longitudeDelta) * currentTuning.maxDeltaPerUpdate
              : center.lng + longitudeDelta;

          const easeOptions: {
            center: [number, number];
            duration: number;
            easing: (t: number) => number;
            bearing?: number;
          } = {
            center: [clampedLng, clampedLat],
            duration: Math.max(40, mapUpdateMs * 0.9),
            easing: (t) => t,
          };

          if (targetBearing !== null) {
            const currentBearing = mapRef.current.getBearing();
            const bearingDelta = shortestAngleDelta(
              targetBearing,
              currentBearing,
            );
            easeOptions.bearing =
              Math.abs(bearingDelta) > currentTuning.maxDeltaPerUpdate
                ? currentBearing +
                  Math.sign(bearingDelta) * currentTuning.maxDeltaPerUpdate
                : currentBearing + bearingDelta;
          }

          mapRef.current.easeTo(easeOptions);
        }
      }

      raf = requestAnimationFrame(step);
    }

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [mapRef, searchParams, syncDiagnostics]);

  return { handleOnSensor, resetCalibration, diagnostics, sensorDebug };
}
