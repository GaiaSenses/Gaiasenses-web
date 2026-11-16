/**
 * What to do with the ball's pose when the globe starts listening to it again.
 *
 * Navigation packets are ignored while a composition plays (URL mode=player)
 * and while auto mode tours the globe. The ball does not stop meanwhile — the
 * common case is the CO2 flow: the composition opens, the person keeps
 * turning the ball, the composition closes. Without a catch-up step the globe
 * would sit at the pre-composition pose until the ball next crosses the start
 * threshold, which in mirror mode a slow rotation may never do.
 *
 * So on re-entry the latest valid pose is applied once:
 *
 *  - settled, and away from the location in the URL (more than
 *    REENTRY_LOCATION_EPSILON_DEG in latitude or longitude): apply it and
 *    refresh the location, i.e. open the weather popup where the ball is;
 *  - settled, at the URL location: apply it (the bearing may have changed)
 *    and keep the location — the popup there is still the right one;
 *  - not settled: apply it and let the per-packet flow carry on from there.
 *
 * Pure module (no React, no map): importable from node:test.
 */

import type { GaiaballNav } from "./ble-decode";

export const REENTRY_LOCATION_EPSILON_DEG = 0.01;

export type NavReentryDecision = {
  /** Pose to apply once with `jumpTo`, [lon, lat] as Mapbox expects. */
  center: [number, number];
  bearing: number;
  /** Seed for the settled-edge tracking. */
  settled: boolean;
  /** Settled away from the URL location: ask for the weather where it is. */
  refreshLocation: boolean;
};

/** Shortest signed difference between two longitudes, in (-180, 180]. */
function longitudeDelta(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

export function decideNavReentry(
  latest: GaiaballNav | null,
  urlLat: number,
  urlLng: number,
): NavReentryDecision | null {
  if (!latest || !latest.valid) return null;

  const awayFromUrl =
    !Number.isFinite(urlLat) ||
    !Number.isFinite(urlLng) ||
    Math.abs(latest.lat - urlLat) > REENTRY_LOCATION_EPSILON_DEG ||
    Math.abs(longitudeDelta(latest.lon, urlLng)) > REENTRY_LOCATION_EPSILON_DEG;

  return {
    center: [latest.lon, latest.lat],
    bearing: latest.bearing,
    settled: latest.settled,
    refreshLocation: latest.settled && awayFromUrl,
  };
}
