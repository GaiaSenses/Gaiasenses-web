import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeSensorNotification,
  decodeCo2Notification,
  resetCo2StaleWarning,
} from "../app/[locale]/map3/ble-decode";

// Golden vectors copied byte for byte from the firmware's own protocol tests
// (gaiaball firmware/test/test_protocol/test_protocol.cpp), which are the
// source of truth for the wire format. The IMU one is the v8 packet: 31 bytes,
// flags 0x0B (quatValid | nineAxis | audioValid) and the microphone envelope
// in the last eight — rms L = 0.00 dBFS, rms R = -20.00, peak L = 0.00,
// peak R = -6.02, each as dBFS x100. The vector used to be the pre-v8 one,
// 23 bytes and flags 0x03, which is how the decoder came to reject every
// packet the firmware actually sends.
const GOLDEN_IMU =
  "01 01 02 01 0D 0C 0B 0A 00 40 00 00 00 00 00 00 01 00 FE FF 03 00 0B" +
  " 00 00 30 F8 00 00 A6 FD";
const GOLDEN_CO2 = "01 02 02 01 0D 0C 0B 0A E8 03 05 07";

function hex(s: string): ArrayBuffer {
  const bytes = s
    .trim()
    .split(/\s+/)
    .map((b) => parseInt(b, 16));
  return new Uint8Array(bytes).buffer;
}

function text(s: string): ArrayBuffer {
  const u8 = new TextEncoder().encode(s);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

function imuPacket(opts: {
  w: number;
  x: number;
  y: number;
  z: number;
  acc?: [number, number, number];
  flags?: number;
  /** Total length, to stand in for a future firmware that appends more. */
  size?: number;
}): ArrayBuffer {
  const buf = new ArrayBuffer(opts.size ?? 31);
  const dv = new DataView(buf);
  dv.setUint8(0, 1);
  dv.setUint8(1, 0x01);
  dv.setUint16(2, 7, true);
  dv.setUint32(4, 123456, true);
  dv.setInt16(8, opts.w, true);
  dv.setInt16(10, opts.x, true);
  dv.setInt16(12, opts.y, true);
  dv.setInt16(14, opts.z, true);
  const [ax, ay, az] = opts.acc ?? [0, 0, 0];
  dv.setInt16(16, ax, true);
  dv.setInt16(18, ay, true);
  dv.setInt16(20, az, true);
  dv.setUint8(22, opts.flags ?? 0b001);
  // Silence, as the firmware encodes it: the -120.00 dBFS floor on all four.
  if (buf.byteLength >= 31) {
    for (const offset of [23, 25, 27, 29]) dv.setInt16(offset, -12000, true);
  }
  return buf;
}

const near = (a: number | null | undefined, b: number, tol = 0.1) =>
  assert.ok(
    typeof a === "number" && Math.abs(a - b) <= tol,
    `expected ${a} ≈ ${b} (±${tol})`,
  );

// ---------------------------------------------------------------------------
// Binary IMU
// ---------------------------------------------------------------------------

test("golden IMU vector decodes to identity quat, zero euler, acc (1,-2,3)", () => {
  const r = decodeSensorNotification(hex(GOLDEN_IMU));
  assert.ok(r);
  assert.deepEqual(r.quat, { quat_w: 1, quat_x: 0, quat_y: 0, quat_z: 0 });
  assert.equal(Math.abs(r.euler.roll ?? NaN), 0);
  assert.equal(Math.abs(r.euler.pitch ?? NaN), 0);
  assert.equal(Math.abs(r.euler.yaw ?? NaN), 0);
  assert.deepEqual(r.acc, { x: 1, y: -2, z: 3 });
});

test("90° yaw quat yields legacy euler (roll 0, pitch 0, yaw -90)", () => {
  const q = Math.round(Math.cos(Math.PI / 4) * 16384); // 11585
  assert.equal(q, 11585);
  const r = decodeSensorNotification(imuPacket({ w: q, x: 0, y: 0, z: q }));
  assert.ok(r);
  near(r.euler.roll, 0);
  near(r.euler.pitch, 0);
  near(r.euler.yaw, -90);
  near(r.quat.quat_w, Math.SQRT1_2, 1e-3);
  near(r.quat.quat_z, Math.SQRT1_2, 1e-3);
});

test("legacy remap: 30° about sensor X shows up as pitch, about Y as roll", () => {
  const c = Math.round(Math.cos(Math.PI / 12) * 16384);
  const s = Math.round(Math.sin(Math.PI / 12) * 16384);
  const rx = decodeSensorNotification(imuPacket({ w: c, x: s, y: 0, z: 0 }));
  assert.ok(rx);
  near(rx.euler.roll, 0);
  near(rx.euler.pitch, 30);
  near(rx.euler.yaw, 0);
  const ry = decodeSensorNotification(imuPacket({ w: c, x: 0, y: s, z: 0 }));
  assert.ok(ry);
  near(ry.euler.roll, 30);
  near(ry.euler.pitch, 0);
  near(ry.euler.yaw, 0);
});

test("quatValid=0 packet → null", () => {
  assert.equal(
    decodeSensorNotification(imuPacket({ w: 16384, x: 0, y: 0, z: 0, flags: 0b110 })),
    null,
  );
});

test("wrong version / type / short packet → null", () => {
  const b = new Uint8Array(hex(GOLDEN_IMU));
  const v2 = b.slice();
  v2[0] = 2;
  assert.equal(decodeSensorNotification(v2.buffer), null);
  const t2 = b.slice();
  t2[1] = 0x02;
  assert.equal(decodeSensorNotification(t2.buffer), null);
  assert.equal(decodeSensorNotification(b.slice(0, 22).buffer), null);
  // the pre-v8 23-byte packet: no shipped firmware sends it, and the Pd bridge
  // does not accept it either
  assert.equal(decodeSensorNotification(b.slice(0, 23).buffer), null);
  // a CO2 packet arriving on the sensor characteristic is ignored
  assert.equal(decodeSensorNotification(hex(GOLDEN_CO2)), null);
});

test("a packet longer than v8 still decodes (fields are append-only)", () => {
  // This is the regression guard for the bug this branch shipped with: an
  // exact-length check turns every notification of the next firmware into
  // silence, and silence here looks exactly like a ball that is not there.
  const q = Math.round(Math.cos(Math.PI / 4) * 16384);
  const futuro = decodeSensorNotification(
    imuPacket({ w: q, x: 0, y: 0, z: q, acc: [1, -2, 3], size: 48 }),
  );
  assert.ok(futuro);
  assert.deepEqual(futuro.acc, { x: 1, y: -2, z: 3 });
  near(futuro.euler.yaw, -90);
});

test("a CO2 packet longer than v8 still decodes", () => {
  const b = new Uint8Array(hex(GOLDEN_CO2));
  const maior = new Uint8Array(20);
  maior.set(b);
  assert.deepEqual(decodeCo2Notification(maior.buffer), { co2: { ppm: 1000 } });
});

// ---------------------------------------------------------------------------
// Binary CO2
// ---------------------------------------------------------------------------

test("golden CO2 vector → ppm 1000", () => {
  assert.deepEqual(decodeCo2Notification(hex(GOLDEN_CO2)), {
    co2: { ppm: 1000 },
  });
});

test("stale CO2 still delivers ppm and warns only once per connection", () => {
  resetCo2StaleWarning();
  const b = new Uint8Array(hex(GOLDEN_CO2));
  b[10] = 0b011; // valid + stale
  const original = console.warn;
  const calls: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    calls.push(args);
  };
  try {
    assert.deepEqual(decodeCo2Notification(b.buffer), { co2: { ppm: 1000 } });
    assert.deepEqual(decodeCo2Notification(b.buffer), { co2: { ppm: 1000 } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "Gaiaball: CO2 stale");
    resetCo2StaleWarning();
    decodeCo2Notification(b.buffer);
    assert.equal(calls.length, 2);
  } finally {
    console.warn = original;
  }
});

test("CO2 wrong length / type → null", () => {
  const b = new Uint8Array(hex(GOLDEN_CO2));
  assert.equal(decodeCo2Notification(b.slice(0, 11).buffer), null);
  assert.equal(decodeCo2Notification(hex(GOLDEN_IMU)), null);
});

// ---------------------------------------------------------------------------
// Legacy JSON fallback (old firmware)
// ---------------------------------------------------------------------------

test("legacy sensor JSON parses identically to JSON.parse", () => {
  const json =
    '{"quat":{"quat_w":0.98,"quat_x":0.01,"quat_y":-0.02,"quat_z":0.19},' +
    '"euler":{"roll":1.5,"pitch":-2.25,"yaw":-21.9},"acc":{"x":120,"y":-34,"z":8150}}';
  assert.deepEqual(decodeSensorNotification(text(json)), JSON.parse(json));
});

test("legacy CO2 JSON parses identically", () => {
  assert.deepEqual(decodeCo2Notification(text('{"co2":{"ppm":850}}')), {
    co2: { ppm: 850 },
  });
});

test("`{}` JSON (the legacy crash case) → null", () => {
  assert.equal(decodeSensorNotification(text("{}")), null);
  assert.equal(decodeCo2Notification(text("{}")), null);
});

test("malformed JSON / wrong shapes → null", () => {
  assert.equal(decodeSensorNotification(text('{"quat":')), null);
  assert.equal(decodeSensorNotification(text('{"quat":5}')), null);
  assert.equal(decodeCo2Notification(text('{"co2":{"ppm":"x"}}')), null);
  assert.equal(decodeCo2Notification(text('{"co2":null}')), null);
  assert.equal(decodeCo2Notification(text("{ not json")), null);
});

// ---------------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------------

test("empty / garbage / non-buffer input → null, never throws", () => {
  assert.equal(decodeSensorNotification(new ArrayBuffer(0)), null);
  assert.equal(decodeCo2Notification(new ArrayBuffer(0)), null);
  assert.equal(decodeSensorNotification(hex("FF 00 13")), null);
  assert.equal(decodeCo2Notification(hex("FF 00 13")), null);
  for (const bad of [null, undefined, 42, "str", {}] as unknown[]) {
    assert.equal(decodeSensorNotification(bad as ArrayBuffer), null);
    assert.equal(decodeCo2Notification(bad as ArrayBuffer), null);
  }
});

test("fuzz: 500 random buffers never throw", () => {
  let seed = 0x1234567;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed;
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    for (let i = 0; i < 500; i++) {
      const len = rnd() % 32;
      const u8 = new Uint8Array(len);
      for (let j = 0; j < len; j++) u8[j] = rnd() & 0xff;
      // bias some iterations toward valid headers / JSON start
      if (len > 1 && i % 3 === 0) {
        u8[0] = 1;
        u8[1] = (i % 2) + 1;
      }
      if (len > 0 && i % 5 === 0) u8[0] = 0x7b;
      const s = decodeSensorNotification(u8.buffer);
      const c = decodeCo2Notification(u8.buffer);
      if (s) {
        for (const v of [...Object.values(s.quat), ...Object.values(s.euler)]) {
          assert.ok(v === null || typeof v === "number");
        }
      }
      if (c) assert.equal(typeof c.co2.ppm, "number");
    }
  } finally {
    console.warn = originalWarn;
  }
});
