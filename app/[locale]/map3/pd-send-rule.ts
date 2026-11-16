/**
 * What the map's polling loop sends to the running Pd patch on each tick.
 *
 * Two kinds of payload exist:
 *
 *  - the sensor list on `gaia.sensors` (roll, pitch, yaw, accX, accY, accZ
 *    in mg, co2) — the raw ball, for a patch that wants to interpret it itself;
 *  - the canonical channels: `gaia.lat`/`gaia.lon` from the map centre,
 *    `gaia.acc.*` and `gaia.co2`, each behind its own dead-band.
 *
 * The canonical channels always go. With a Gaiaball connected the map centre
 * is wherever the ball's navigation put the globe, so `gaia.lat`/`gaia.lon`
 * are the ball's position; a patch that also declares `gaia.sensors` gets the
 * raw list on top.
 *
 * There used to be an exception: a patch that published `gaia.out` got the
 * list alone while the ball was connected, so that paraisoGaia43 kept hearing
 * exactly what it was built for. That patch is gone, and its successor, the
 * globe patch mapa15 ("TesteGlobo2.0"), still publishes `gaia.out` but builds
 * its sound from `gaia.lat`, `gaia.lon` and `gaia.acc.*` — the exception would
 * have cut every one of them whenever a ball was connected. `gaia.out` itself
 * no longer steers anything; it only shows up in the patch I/O log.
 *
 * Pure module (no React, no pd4web): importable from node:test.
 */

export type PdSendInputs = {
  /** A Gaiaball is connected (input mode is not "mouse"). */
  sensorConnected: boolean;
  /** The patch declares a receiver for `gaia.sensors`. */
  hasSensorsReceiver: boolean;
};

export type PdSendDecision = Readonly<{
  sendSensorList: boolean;
  sendCanonical: boolean;
}>;

// Shared, frozen answers: the loop asks every tick and needs no fresh object.
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
}: PdSendInputs): PdSendDecision {
  return sensorConnected && hasSensorsReceiver
    ? SENSOR_LIST_AND_CANONICAL
    : CANONICAL_ONLY;
}
