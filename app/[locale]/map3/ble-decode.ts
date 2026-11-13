// Decoders for Gaiaball BLE notifications.
//
// The Gaiaball v2 firmware sends compact little-endian binary packets (see the
// gaiaball repo, firmware/docs/protocol.md). That is the only format read here:
// the JSON of the original firmware is gone, so a notification that is not a
// version-1 packet of the expected type is simply dropped.
//
// Pure module (no React): importable from node:test. Never throws.

/** Microphone envelope, dBFS (left, right). Silence reads -120. */
export type GaiaballAudioEnvelope = {
  rmsDb: [number, number];
  peakDb: [number, number];
};

export type espResponse = {
  quat: {
    quat_w: number;
    quat_x: number;
    quat_y: number;
    quat_z: number;
  };
  euler: {
    roll: number;
    pitch: number;
    yaw: number;
  };
  acc: {
    x: number;
    y: number;
    z: number;
  };
  /** Present only while the packet says the envelope is valid (flags bit3). */
  audio?: GaiaballAudioEnvelope;
};

export type espCo2Response = {
  co2: { ppm: number };
  /**
   * The ball's own decision that a composition should be open (flags bit3).
   * The firmware already applies the threshold and its hysteresis, and forces
   * it off when the reading is stale — the site only follows it.
   */
  trigger: boolean;
};

/**
 * Navigation computed on the ball (NavPacket, type 0x07), ready to apply to
 * the globe: lat/lon of the screen centre and the Mapbox bearing.
 */
export type GaiaballNav = {
  /** 0 off, 1 mirror, 2 joystick. */
  mode: number;
  /** flags bit0: false in the 1 Hz keepalive (navigation off, no IMU). */
  valid: boolean;
  /** flags bit1: the authority for "the ball stopped". */
  settled: boolean;
  /**
   * flags bit2: instantaneous speed above the stop threshold. Informative
   * only — in mirror mode valid|settled|moving is a legal combination, so it
   * never decides whether the ball stopped.
   */
  moving: boolean;
  lat: number;
  lon: number;
  /** Degrees clockwise from north of the direction pointing up, (-180, 180]. */
  bearing: number;
  speedDegS: number;
  seq: number;
  tUs: number;
};

const PROTOCOL_VERSION = 1;
const TYPE_IMU = 0x01;
const TYPE_CO2 = 0x02;
const TYPE_NAV = 0x07;

/**
 * Minimum sizes, not exact ones.
 *
 * `ImuPacket` grew from 23 to 31 bytes in firmware v8, which appended the
 * microphone envelope (four `int16`, dBFS x100) after the flags byte. The
 * protocol version byte stays `1` on purpose: every field is append-only and
 * the earlier bytes are untouched, so a decoder reading offsets 0..22 keeps
 * working. `firmware/docs/protocol.md` spells out the consequence — "a decoder
 * that checks an exact length must be updated (the config-app and the Pd
 * bridge were)" — and this one was the third, written against the 23-byte
 * packet and rejecting everything the v8 firmware sends.
 *
 * Which is why the comparison below is `<` and not `!==`. An exact check is a
 * bomb with a timer on it: the next append breaks the site again, silently,
 * because a rejected notification is indistinguishable from a ball that is
 * not there. The Pd bridge (`pd-gaiaball/gaiaball_bridge.py`) already reads
 * `len(data) < 31` for the same reason.
 *
 * Note that 23 is now the size of `SensorsPacket` (type 0x04) — one more
 * reason not to keep that number here as the IMU's length.
 */
const IMU_PACKET_MIN_SIZE = 31;
const CO2_PACKET_MIN_SIZE = 12;
/** Same rule as the IMU: a longer NavPacket from a newer firmware still decodes. */
const NAV_PACKET_MIN_SIZE = 22;

const Q14 = 16384;
const RAD_TO_DEG = 180 / Math.PI;

const IMU_FLAG_QUAT_VALID = 1 << 0;
const IMU_FLAG_AUDIO_VALID = 1 << 3;
const CO2_FLAG_STALE = 1 << 1;
const CO2_FLAG_TRIGGER = 1 << 3;
const NAV_FLAG_VALID = 1 << 0;
const NAV_FLAG_SETTLED = 1 << 1;
const NAV_FLAG_MOVING = 1 << 2;

let co2StaleWarned = false;

/** Re-arms the one-shot "CO2 stale" warning (call on every new connection). */
export function resetCo2StaleWarning(): void {
  co2StaleWarned = false;
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
    if (!(buf instanceof ArrayBuffer)) return null;
    const dv = new DataView(buf);

    if (
      buf.byteLength < IMU_PACKET_MIN_SIZE ||
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

    const imu: espResponse = {
      quat: { quat_w: w, quat_x: x, quat_y: y, quat_z: z },
      euler: quatToEulerLegacy(w, x, y, z),
      acc: {
        x: dv.getInt16(16, true),
        y: dv.getInt16(18, true),
        z: dv.getInt16(20, true),
      },
    };

    // Bytes 23..30 carry the microphone envelope (RMS L, RMS R, peak L,
    // peak R, int16 dBFS x100), meaningful only while flags bit3 is set. It is
    // exposed to sketches through lib/gaiaball-live.ts; no Pd channel carries
    // it — `gaia.sensors` is a fixed list of seven values that paraisoGaia43
    // unpacks, and a new channel is a decision for the musicians.
    if ((flags & IMU_FLAG_AUDIO_VALID) !== 0) {
      imu.audio = {
        rmsDb: [dv.getInt16(23, true) / 100, dv.getInt16(25, true) / 100],
        peakDb: [dv.getInt16(27, true) / 100, dv.getInt16(29, true) / 100],
      };
    }

    return imu;
  } catch {
    return null;
  }
}

export function decodeCo2Notification(
  buf: ArrayBuffer,
): espCo2Response | null {
  try {
    if (!(buf instanceof ArrayBuffer)) return null;
    const dv = new DataView(buf);

    if (
      buf.byteLength < CO2_PACKET_MIN_SIZE ||
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

    return {
      co2: { ppm: dv.getUint16(8, true) },
      trigger: (flags & CO2_FLAG_TRIGGER) !== 0,
    };
  } catch {
    return null;
  }
}

/**
 * NavPacket, 22 bytes: u8 version · u8 type · u16 seq · u32 timestampUs ·
 * u8 mode · u8 flags · i32 latE7 · i32 lonE7 · i16 bearingX100 ·
 * u16 speedDegSX10 (offsets 0, 1, 2, 4, 8, 9, 10, 14, 18, 20).
 *
 * The keepalive (valid = 0) is decoded too, not dropped: the caller decides
 * what an invalid pose means, and the live store needs to know it arrived.
 */
export function decodeNavNotification(buf: ArrayBuffer): GaiaballNav | null {
  try {
    if (!(buf instanceof ArrayBuffer)) return null;
    const dv = new DataView(buf);

    if (
      buf.byteLength < NAV_PACKET_MIN_SIZE ||
      dv.getUint8(0) !== PROTOCOL_VERSION ||
      dv.getUint8(1) !== TYPE_NAV
    ) {
      return null;
    }

    const flags = dv.getUint8(9);
    return {
      mode: dv.getUint8(8),
      valid: (flags & NAV_FLAG_VALID) !== 0,
      settled: (flags & NAV_FLAG_SETTLED) !== 0,
      moving: (flags & NAV_FLAG_MOVING) !== 0,
      lat: dv.getInt32(10, true) / 1e7,
      lon: dv.getInt32(14, true) / 1e7,
      bearing: dv.getInt16(18, true) / 100,
      speedDegS: dv.getUint16(20, true) / 10,
      seq: dv.getUint16(2, true),
      tUs: dv.getUint32(4, true),
    };
  } catch {
    return null;
  }
}
