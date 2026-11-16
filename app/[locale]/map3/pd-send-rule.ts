/**
 * What the map's polling loop sends to the running Pd patch on each tick.
 *
 * Two kinds of payload exist:
 *
 *  - the sensor list on `gaia.sensors` (roll, pitch, yaw, accX, accY, accZ,
 *    co2) — the raw ball, for a patch that wants to interpret it itself;
 *  - the canonical channels: `gaia.lat`/`gaia.lon` from the map centre,
 *    `gaia.acc.*` and `gaia.co2`, each behind its own dead-band.
 *
 * A patch that declares a `gaia.sensors` receiver AND publishes `gaia.out`
 * (today only paraisoGaia43) gets the sensor list alone, exactly as before:
 * it builds its own sound from the raw ball. Its `gaia.out` no longer moves
 * the globe — the ball computes the navigation — but the patch still sees the
 * same input it always did.
 *
 * A patch with a sensors receiver and no `gaia.out` gets both, since nothing
 * in it stands in for the map position. With no ball connected, or no sensors
 * receiver, the canonical channels are the whole story.
 *
 * Pure module (no React, no pd4web): importable from node:test.
 */

export type PdSendInputs = {
  /** A Gaiaball is connected (input mode is not "mouse"). */
  sensorConnected: boolean;
  /** The patch declares a receiver for `gaia.sensors`. */
  hasSensorsReceiver: boolean;
  /** The patch publishes `gaia.out`. */
  publishesOut: boolean;
};

export type PdSendDecision = Readonly<{
  sendSensorList: boolean;
  sendCanonical: boolean;
}>;

// Shared, frozen answers: the loop asks every tick and needs no fresh object.
const SENSOR_LIST_ONLY: PdSendDecision = Object.freeze({
  sendSensorList: true,
  sendCanonical: false,
});
const SENSOR_LIST_AND_CANONICAL: PdSendDecision = Object.freeze({
  sendSensorList: true,
  sendCanonical: true,
});
const CANONICAL_ONLY: PdSendDecision = Object.freeze({
  sendSensorList: false,
  sendCanonical: true,
});

export function decidePdSend({
  sensorConnected,
  hasSensorsReceiver,
  publishesOut,
}: PdSendInputs): PdSendDecision {
  if (sensorConnected && hasSensorsReceiver) {
    return publishesOut ? SENSOR_LIST_ONLY : SENSOR_LIST_AND_CANONICAL;
  }
  return CANONICAL_ONLY;
}
