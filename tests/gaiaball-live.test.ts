import test from "node:test";
import assert from "node:assert/strict";
import {
  gaiaball,
  publishGaiaballCo2,
  publishGaiaballConnected,
  publishGaiaballImu,
  publishGaiaballNav,
  type Co2,
  type Imu,
  type Nav,
} from "../lib/gaiaball-live";

const NAV: Nav = {
  mode: 1,
  valid: true,
  settled: false,
  moving: true,
  lat: -22.905556,
  lon: -47.060833,
  bearing: 45,
  speedDegS: 12.3,
  seq: 258,
  tUs: 12345678,
};

const IMU: Imu = {
  quat: { quat_w: 1, quat_x: 0, quat_y: 0, quat_z: 0 },
  euler: { roll: 0, pitch: 0, yaw: 0 },
  acc: { x: 1, y: -2, z: 3 },
  audio: { rmsDb: [0, -20], peakDb: [0, -6.02] },
};

const CO2: Co2 = { co2: { ppm: 1000 }, trigger: true };

// The store is module state shared by every test in this file (node --test
// runs each file in its own process); each test starts from a disconnect.

test("starts disconnected and empty", () => {
  const s = gaiaball.get();
  assert.equal(s.connected, false);
  assert.equal(s.nav, null);
  assert.equal(s.imu, null);
  assert.equal(s.co2, null);
  assert.equal(s.updatedAt, 0);
});

test("get() returns the same snapshot object until something is published", () => {
  publishGaiaballConnected(true);
  publishGaiaballImu(IMU);
  const a = gaiaball.get();
  for (let i = 0; i < 1000; i++) assert.equal(gaiaball.get(), a);
  publishGaiaballNav(NAV);
  assert.notEqual(gaiaball.get(), a);
  publishGaiaballConnected(false);
});

test("connected samples are visible; an old snapshot never changes", () => {
  publishGaiaballConnected(false);
  publishGaiaballConnected(true);
  const antes = gaiaball.get();
  assert.equal(antes.connected, true);

  publishGaiaballNav(NAV);
  publishGaiaballImu(IMU);
  publishGaiaballCo2(CO2);

  const s = gaiaball.get();
  assert.equal(s.connected, true);
  assert.equal(s.nav, NAV);
  assert.equal(s.imu, IMU);
  assert.equal(s.co2, CO2);
  assert.ok(s.updatedAt > 0);
  // the snapshot taken before the samples is untouched
  assert.equal(antes.nav, null);
  assert.equal(antes.imu, null);
  assert.equal(antes.co2, null);

  // a newer sample replaces only its own field
  const nav2: Nav = { ...NAV, settled: true, moving: false, seq: 259 };
  publishGaiaballNav(nav2);
  assert.equal(gaiaball.get().nav, nav2);
  assert.equal(gaiaball.get().imu, IMU);
  assert.equal(gaiaball.get().co2, CO2);
  publishGaiaballConnected(false);
});

test("disconnect clears nav, imu and co2", () => {
  publishGaiaballConnected(true);
  publishGaiaballNav(NAV);
  publishGaiaballImu(IMU);
  publishGaiaballCo2(CO2);
  publishGaiaballConnected(false);
  const s = gaiaball.get();
  assert.equal(s.connected, false);
  assert.equal(s.nav, null);
  assert.equal(s.imu, null);
  assert.equal(s.co2, null);
});

test("samples published while disconnected are dropped", () => {
  publishGaiaballConnected(false);
  const antes = gaiaball.get();
  publishGaiaballNav(NAV);
  publishGaiaballImu(IMU);
  publishGaiaballCo2(CO2);
  assert.equal(gaiaball.get(), antes);
  assert.equal(gaiaball.get().nav, null);
  assert.equal(gaiaball.get().imu, null);
  assert.equal(gaiaball.get().co2, null);
});

test("reconnecting starts empty again", () => {
  publishGaiaballConnected(true);
  publishGaiaballNav(NAV);
  publishGaiaballConnected(false);
  publishGaiaballConnected(true);
  const s = gaiaball.get();
  assert.equal(s.connected, true);
  assert.equal(s.nav, null);
  publishGaiaballConnected(false);
});

test("subscribe is called with each new snapshot; unsubscribe stops it", () => {
  publishGaiaballConnected(false);
  const vistos: unknown[] = [];
  const parar = gaiaball.subscribe((s) => {
    vistos.push(s);
  });
  publishGaiaballConnected(true);
  publishGaiaballCo2(CO2);
  assert.equal(vistos.length, 2);
  assert.equal(vistos[1], gaiaball.get());
  parar();
  publishGaiaballImu(IMU);
  assert.equal(vistos.length, 2);
  publishGaiaballConnected(false);
});

test("a throwing listener neither breaks the publisher nor the others", () => {
  publishGaiaballConnected(false);
  const originalError = console.error;
  console.error = () => {};
  let chamadas = 0;
  const pararRuim = gaiaball.subscribe(() => {
    throw new Error("sketch quebrado");
  });
  const pararBom = gaiaball.subscribe(() => {
    chamadas++;
  });
  try {
    assert.doesNotThrow(() => publishGaiaballConnected(true));
    assert.doesNotThrow(() => publishGaiaballNav(NAV));
    assert.equal(chamadas, 2);
    assert.equal(gaiaball.get().nav, NAV);
  } finally {
    pararRuim();
    pararBom();
    console.error = originalError;
    publishGaiaballConnected(false);
  }
});
