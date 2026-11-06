// Decoders for Gaiaball BLE notifications.
//
// Gaiaball v2 firmware sends compact little-endian binary packets (see the
// gaiaball repo, firmware/docs/protocol.md). The legacy firmware sends JSON.
// Both are turned into the same legacy object shapes, so everything
// downstream (smoothing, Pure Data, globe) stays untouched.
//
// Pure module (no React): importable from node:test. Never throws.

export type espResponse = {
  quat: {
    quat_w: number | null;
    quat_x: number | null;
    quat_y: number | null;
    quat_z: number | null;
  };
  euler: {
    roll: number | null;
    pitch: number | null;
    yaw: number | null;
  };
  acc?: {
    x: number | null;
    y: number | null;
    z: number | null;
  };
};

export type espCo2Response = {
  co2: { ppm: number };
};

const PROTOCOL_VERSION = 1;
const TYPE_IMU = 0x01;
const TYPE_CO2 = 0x02;
const IMU_PACKET_SIZE = 23;
const CO2_PACKET_SIZE = 12;
const JSON_OPEN_BRACE = 0x7b; // '{'
const Q14 = 16384;
const RAD_TO_DEG = 180 / Math.PI;

const IMU_FLAG_QUAT_VALID = 1 << 0;
const CO2_FLAG_STALE = 1 << 1;

let co2StaleWarned = false;

/** Re-arms the one-shot "CO2 stale" warning (call on every new connection). */
export function resetCo2StaleWarning(): void {
  co2StaleWarned = false;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseJson(buf: ArrayBuffer): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8").decode(buf));
  } catch {
    return undefined;
  }
}

/**
 * Euler angles (degrees) with the legacy firmware convention
 * (firmware-original.ino; QuatMath::quatToEulerLegacy): axes remapped as
 * qw=w, qx=y, qy=x, qz=-z, then standard roll/pitch/yaw formulas.
 */
export function quatToEulerLegacy(
  w: number,
  x: number,
  y: number,
  z: number,
): { roll: number; pitch: number; yaw: number } {
  const qw = w;
  const qx = y;
  const qy = x;
  const qz = -z;

  const roll = Math.atan2(
    2 * (qw * qx + qy * qz),
    1 - 2 * (qx * qx + qy * qy),
  );
  const t2 = Math.min(1, Math.max(-1, 2 * (qw * qy - qx * qz)));
  const pitch = Math.asin(t2);
  const yaw = Math.atan2(
    2 * (qw * qz + qx * qy),
    1 - 2 * (qy * qy + qz * qz),
  );

  // "+ 0" normalizes -0 to 0.
  return {
    roll: roll * RAD_TO_DEG + 0,
    pitch: pitch * RAD_TO_DEG + 0,
    yaw: yaw * RAD_TO_DEG + 0,
  };
}

export function decodeSensorNotification(
  buf: ArrayBuffer,
): espResponse | null {
  try {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0) return null;
    const dv = new DataView(buf);

    if (dv.getUint8(0) === JSON_OPEN_BRACE) {
      const parsed = parseJson(buf);
      if (!isObject(parsed) || !isObject(parsed.quat)) return null;
      return parsed as espResponse;
    }

    if (
      buf.byteLength !== IMU_PACKET_SIZE ||
      dv.getUint8(0) !== PROTOCOL_VERSION ||
      dv.getUint8(1) !== TYPE_IMU
    ) {
      return null;
    }

    const flags = dv.getUint8(22);
    if ((flags & IMU_FLAG_QUAT_VALID) === 0) return null;

    const w = dv.getInt16(8, true) / Q14;
    const x = dv.getInt16(10, true) / Q14;
    const y = dv.getInt16(12, true) / Q14;
    const z = dv.getInt16(14, true) / Q14;

    return {
      quat: { quat_w: w, quat_x: x, quat_y: y, quat_z: z },
      euler: quatToEulerLegacy(w, x, y, z),
      acc: {
        x: dv.getInt16(16, true),
        y: dv.getInt16(18, true),
        z: dv.getInt16(20, true),
      },
    };
  } catch {
    return null;
  }
}

export function decodeCo2Notification(
  buf: ArrayBuffer,
): espCo2Response | null {
  try {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0) return null;
    const dv = new DataView(buf);

    if (dv.getUint8(0) === JSON_OPEN_BRACE) {
      const parsed = parseJson(buf);
      if (
        !isObject(parsed) ||
        !isObject(parsed.co2) ||
        typeof parsed.co2.ppm !== "number"
      ) {
        return null;
      }
      return parsed as espCo2Response;
    }

    if (
      buf.byteLength !== CO2_PACKET_SIZE ||
      dv.getUint8(0) !== PROTOCOL_VERSION ||
      dv.getUint8(1) !== TYPE_CO2
    ) {
      return null;
    }

    const flags = dv.getUint8(10);
    if ((flags & CO2_FLAG_STALE) !== 0 && !co2StaleWarned) {
      co2StaleWarned = true;
      console.warn("Gaiaball: CO2 stale");
    }

    return { co2: { ppm: dv.getUint16(8, true) } };
  } catch {
    return null;
  }
}
