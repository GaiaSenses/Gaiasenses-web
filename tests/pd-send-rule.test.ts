import test from "node:test";
import assert from "node:assert/strict";
import { decidePdSend } from "../app/[locale]/map3/pd-send-rule";

const casos: [
  sensorConnected: boolean,
  hasSensorsReceiver: boolean,
  sendSensorList: boolean,
  sendCanonical: boolean,
][] = [
  // connected + gaia.sensors: the list and the canonical channels
  [true, true, true, true],
  // everything else: the canonical channels alone
  [true, false, false, true],
  [false, true, false, true],
  [false, false, false, true],
];

test("decidePdSend covers all four input combinations", () => {
  for (const [conn, sensors, list, canonical] of casos) {
    assert.deepEqual(
      decidePdSend({ sensorConnected: conn, hasSensorsReceiver: sensors }),
      { sendSensorList: list, sendCanonical: canonical },
      `connected=${conn} sensors=${sensors}`,
    );
  }
});

test("the globe patch (mapa15) with the ball connected gets the list and the canonical channels", () => {
  // mapa15 publishes gaia.out, but its sound comes from gaia.lat, gaia.lon and
  // gaia.acc.*: publishing gaia.out must not cut them.
  const d = decidePdSend({ sensorConnected: true, hasSensorsReceiver: true });
  assert.equal(d.sendSensorList, true);
  assert.equal(d.sendCanonical, true);
});

test("the canonical channels are always sent", () => {
  for (const conn of [true, false]) {
    for (const sensors of [true, false]) {
      const d = decidePdSend({
        sensorConnected: conn,
        hasSensorsReceiver: sensors,
      });
      assert.equal(d.sendCanonical, true, `connected=${conn} sensors=${sensors}`);
    }
  }
});

test("without a ball the sensor list is never sent", () => {
  for (const sensors of [true, false]) {
    const d = decidePdSend({ sensorConnected: false, hasSensorsReceiver: sensors });
    assert.equal(d.sendSensorList, false, `sensors=${sensors}`);
  }
});

test("the answers are frozen and reused (no allocation per tick)", () => {
  const entrada = { sensorConnected: true, hasSensorsReceiver: true };
  const a = decidePdSend(entrada);
  assert.equal(decidePdSend(entrada), a);
  assert.ok(Object.isFrozen(a));
});
