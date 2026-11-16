import test from "node:test";
import assert from "node:assert/strict";
import { decidePdSend } from "../app/[locale]/map3/pd-send-rule";

const casos: [
  sensorConnected: boolean,
  hasSensorsReceiver: boolean,
  publishesOut: boolean,
  sendSensorList: boolean,
  sendCanonical: boolean,
][] = [
  // connected + gaia.sensors + gaia.out (paraisoGaia43): the list alone, as before
  [true, true, true, true, false],
  // connected + gaia.sensors, no gaia.out: the list and the canonical channels
  [true, true, false, true, true],
  // everything else falls through to the canonical channels
  [true, false, true, false, true],
  [true, false, false, false, true],
  [false, true, true, false, true],
  [false, true, false, false, true],
  [false, false, true, false, true],
  [false, false, false, false, true],
];

test("decidePdSend covers all eight input combinations", () => {
  for (const [conn, sensors, out, list, canonical] of casos) {
    assert.deepEqual(
      decidePdSend({
        sensorConnected: conn,
        hasSensorsReceiver: sensors,
        publishesOut: out,
      }),
      { sendSensorList: list, sendCanonical: canonical },
      `connected=${conn} sensors=${sensors} out=${out}`,
    );
  }
});

test("paraisoGaia43 with the ball connected keeps today's behaviour", () => {
  const d = decidePdSend({
    sensorConnected: true,
    hasSensorsReceiver: true,
    publishesOut: true,
  });
  assert.equal(d.sendSensorList, true);
  assert.equal(d.sendCanonical, false);
});

test("without a ball the sensor list is never sent", () => {
  for (const sensors of [true, false]) {
    for (const out of [true, false]) {
      const d = decidePdSend({
        sensorConnected: false,
        hasSensorsReceiver: sensors,
        publishesOut: out,
      });
      assert.equal(d.sendSensorList, false);
      assert.equal(d.sendCanonical, true);
    }
  }
});

test("the answers are frozen and reused (no allocation per tick)", () => {
  const entrada = {
    sensorConnected: true,
    hasSensorsReceiver: true,
    publishesOut: false,
  };
  const a = decidePdSend(entrada);
  assert.equal(decidePdSend(entrada), a);
  assert.ok(Object.isFrozen(a));
});
