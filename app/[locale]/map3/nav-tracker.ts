/**
 * How the globe follows the ball's navigation packets, as a pure step
 * function: no React, no map, importable from node:test. use-ble-sensor.ts
 * keeps one NavTrackerState in a ref, feeds it every NavPacket through
 * navTrackerStep and the gate reopening through navTrackerReenter, and
 * performs the effects that come back (jumpTo, handleMotionStop, reopenPopup).
 *
 * Rules:
 *  - `settled` is the only authority for "stopped"; the flags' `moving` bit
 *    is never consulted (mirror mode may send valid|settled|moving).
 *  - A moving pose is applied with `jumpTo`. While settled the map is left
 *    alone: the pose was applied on the way in, and a `jumpTo` would hide the
 *    popup the stop just opened.
 *  - The packet that turns settled after a moving pose was applied is a real
 *    stop: its pose is applied once and the location refreshed.
 *  - A settled packet while not tracking (the first after a connect, or after
 *    a valid = 0 reset) syncs the globe once, with the same catch-up as a
 *    re-entry: without it, a ball connected at rest would never move the map
 *    until it next crossed the start threshold.
 *  - valid = 0 (navigation off, IMU unavailable) forgets the edge and the
 *    remembered pose, so motion before a dropout cannot turn into a stop after
 *    it. A (re)connect resets the state the same way (NAV_TRACKER_RESET).
 *  - While the gate is closed (URL mode=player, auto mode) or the input is the
 *    mouse, packets only update the remembered pose.
 */

import type { GaiaballNav } from "./ble-decode";
import { decideNavReentry } from "./nav-reentry";

export type NavTrackerState = {
  /**
   * `settled` of the last pose applied to the map; null = not tracking (after
   * a connect or a valid = 0 packet, until a pose is applied).
   */
  readonly settled: boolean | null;
  /** Latest valid pose, kept while packets are ignored; null after valid = 0. */
  readonly latest: GaiaballNav | null;
};

export const NAV_TRACKER_RESET: NavTrackerState = Object.freeze({
  settled: null,
  latest: null,
});

export type NavTrackerContext = {
  /** URL mode=map and auto mode off. */
  gateOpen: boolean;
  /** "mouse" = the ball does not steer. */
  inputMode: string;
  /** Location in the URL (what the weather popup shows). */
  urlLat: number;
  urlLng: number;
};

export type NavJump = { center: [number, number]; bearing: number };

export type NavTrackerEffects = {
  state: NavTrackerState;
  /** Apply this pose once. */
  jumpTo?: NavJump;
  /** Refresh the location to the map centre (handleMotionStop). */
  motionStop?: true;
  /** Show the weather popup again (a jumpTo hides it). */
  reopenPopup?: true;
};

const poseOf = (nav: GaiaballNav): NavJump => ({
  center: [nav.lon, nav.lat],
  bearing: nav.bearing,
});

/** One NavPacket. */
export function navTrackerStep(
  state: NavTrackerState,
  nav: GaiaballNav,
  ctx: NavTrackerContext,
): NavTrackerEffects {
  if (!nav.valid) return { state: NAV_TRACKER_RESET };

  const latest = nav;
  if (!ctx.gateOpen || ctx.inputMode === "mouse") {
    return { state: { settled: state.settled, latest } };
  }

  if (!nav.settled) {
    return { state: { settled: false, latest }, jumpTo: poseOf(nav) };
  }
  if (state.settled === false) {
    return {
      state: { settled: true, latest },
      jumpTo: poseOf(nav),
      motionStop: true,
    };
  }
  if (state.settled === null) return catchUp(latest, ctx);
  return { state: { settled: true, latest } };
}

/**
 * The gate reopens (player → map, auto mode off): the latest valid pose is
 * applied once and seeds the tracking (see nav-reentry.ts for the decision).
 */
export function navTrackerReenter(
  state: NavTrackerState,
  ctx: NavTrackerContext,
): NavTrackerEffects {
  if (ctx.inputMode === "mouse") return { state };
  if (!state.latest) return { state };
  return catchUp(state.latest, ctx);
}

/**
 * Applies the valid pose `latest` once and seeds the tracking with its
 * `settled`; settled away from the URL location (nav-reentry.ts) refreshes the
 * location, settled at it brings the popup back (the jumpTo hid it).
 */
function catchUp(
  latest: GaiaballNav,
  ctx: NavTrackerContext,
): NavTrackerEffects {
  const d = decideNavReentry(latest, ctx.urlLat, ctx.urlLng);
  if (!d) return { state: { settled: null, latest } }; // not valid: unreachable here
  const fx: NavTrackerEffects = {
    state: { settled: d.settled, latest },
    jumpTo: { center: d.center, bearing: d.bearing },
  };
  if (d.refreshLocation) fx.motionStop = true;
  else if (d.settled) fx.reopenPopup = true;
  return fx;
}
