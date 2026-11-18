/**
 * Anchoring the ball to the map on connect, so the globe does not jump.
 *
 * The ball reports an ABSOLUTE pose relative to its navigation reference
 * (Campinas by default), so the first NavPacket after a connect used to drag
 * the globe from wherever the visitor was looking to the ball's pose. The
 * site instead tells the ball where the map is:
 * command 0x17 carries the map's centre and bearing, the ball zeroes its
 * orientation at that instant and adopts that pose as its reference for the
 * session, and the next NavPacket reports exactly it.
 *
 * Per connection (and per successful reconnect), in order:
 *  a. wait for the first NavPacket;
 *  b. on an AUTOMATIC reconnect (link drop), if `anchorSeq` equals the one
 *     that confirmed this page's last anchor, the ball did not reboot and
 *     still holds that anchor: let every packet through without sending
 *     (0x17 also re-zeroes the ball, usually while a visitor holds it). A
 *     manual connect always anchors;
 *  c. otherwise remember seq0 = anchorSeq, ask for the command to be sent
 *     with the map's current view, and drop packets (no map movement) until
 *     one arrives with anchorSeq !== seq0: anchored, everything passes from
 *     then on (the caller resets the tracker first, so the confirming packet
 *     syncs to the pose the map already has: popup back, no jump);
 *  d. no confirmation ANCHOR_CONFIRM_TIMEOUT_MS after the send, or a failed
 *     write: give up and let packets through (the globe jumps to the ball's
 *     pose), reporting it once so the caller can warn.
 *
 * The timeout is seen on the next packet: with nothing arriving there is
 * nothing to let through either. A confirmation that arrives after the
 * deadline but before any other packet still counts — the ball did anchor.
 *
 * Pure module (no React, no BLE): importable from node:test.
 */

import type { GaiaballNav } from "./ble-decode";

/** Command opcode, written to the command characteristic (…0002). */
export const ANCHOR_OPCODE = 0x17;
/** u8 opcode · i32 latE6 · i32 lonE6 · i16 bearingX100, little-endian. */
export const ANCHOR_COMMAND_SIZE = 11;
export const ANCHOR_CONFIRM_TIMEOUT_MS = 1500;

/** Wraps an integer number of units into (−half, half], exactly. */
function wrapHalfOpen(units: number, half: number): number {
  const full = 2 * half;
  const d = ((units % full) + full) % full;
  return d > half ? d - full : d;
}

/**
 * The anchor command for a map view: latitude clamped to [−90, 90],
 * longitude and bearing normalized into (−180, 180], rounded to 1e-6° and
 * 0.01°. Normalization happens after rounding, so a value that only rounds
 * onto −180 is still sent as 180.
 */
export function encodeAnchorCommand(
  lat: number,
  lon: number,
  bearing: number,
): Uint8Array {
  const latE6 = Math.min(90e6, Math.max(-90e6, Math.round(lat * 1e6)));
  const lonE6 = wrapHalfOpen(Math.round(lon * 1e6), 180e6);
  const bearingX100 = wrapHalfOpen(Math.round(bearing * 100), 18000);

  const bytes = new Uint8Array(ANCHOR_COMMAND_SIZE);
  const dv = new DataView(bytes.buffer);
  dv.setUint8(0, ANCHOR_OPCODE);
  dv.setInt32(1, latE6, true);
  dv.setInt32(5, lonE6, true);
  dv.setInt16(9, bearingX100, true);
  return bytes;
}

export type AnchorState =
  /**
   * Connected, no NavPacket yet. `keepSeq` (automatic reconnect only): the
   * anchorSeq of this page's last confirmed anchor, kept if the ball reports it.
   */
  | {
      readonly phase: "awaitFirst";
      readonly keepSeq?: number;
    }
  /** Command sent; NavPackets are dropped until anchorSeq leaves seq0. */
  | {
      readonly phase: "confirming";
      readonly seq0: number;
      readonly deadlineMs: number;
    }
  /**
   * Anchored or given up: every packet passes.
   * `confirmedSeq`: the anchorSeq that confirmed this page's anchor (or that
   * a reconnect found still in place); absent when nothing was confirmed.
   */
  | { readonly phase: "passthrough"; readonly confirmedSeq?: number };

export type AnchorGiveUpReason = "timeout" | "write-failed";

export type AnchorStep = {
  state: AnchorState;
  /** Hand the packet on (tracker, live store, info card); false = drop it. */
  accept: boolean;
  /** Write the anchor command now, with the map's centre and bearing. */
  send?: true;
  /** This packet confirms the anchor: reset the tracker, then hand it on. */
  anchored?: true;
  /** Anchoring abandoned (reported once): packets flow as before. */
  gaveUp?: AnchorGiveUpReason;
};

const PASSTHROUGH: AnchorState = Object.freeze({ phase: "passthrough" });

/** No anchoring in progress (before the first connect, after a disconnect). */
export const ANCHOR_IDLE: AnchorState = PASSTHROUGH;

/** How a connection started, for anchorStart. */
export type AnchorStartOptions = {
  /** True for an automatic reconnect after a link drop; false = the user connected. */
  readonly reconnect?: boolean;
  /** anchorConfirmedSeq() of the state before the link dropped. */
  readonly lastConfirmedSeq?: number;
};

/**
 * A new anchoring, on every connect and successful reconnect. Only an
 * automatic reconnect may skip the anchor (see b above).
 */
export function anchorStart(options: AnchorStartOptions = {}): AnchorState {
  if (options.reconnect && options.lastConfirmedSeq !== undefined) {
    return { phase: "awaitFirst", keepSeq: options.lastConfirmedSeq };
  }
  return { phase: "awaitFirst" };
}

/**
 * The anchorSeq the ball reports while it still holds this page's last
 * confirmed anchor; undefined when nothing was confirmed, or a newer anchor
 * was asked for since.
 */
export function anchorConfirmedSeq(state: AnchorState): number | undefined {
  switch (state.phase) {
    case "passthrough":
      return state.confirmedSeq;
    case "awaitFirst":
      return state.keepSeq;
    case "confirming":
      return undefined;
  }
}

/** One NavPacket, at `nowMs` (any monotonic clock). */
export function anchorStep(
  state: AnchorState,
  nav: GaiaballNav,
  nowMs: number,
): AnchorStep {
  switch (state.phase) {
    case "passthrough":
      return { state, accept: true };

    case "awaitFirst":
      if (state.keepSeq !== undefined && nav.anchorSeq === state.keepSeq) {
        // Same ball, same anchor: the tracker catches up to its pose as before.
        return {
          state: { phase: "passthrough", confirmedSeq: state.keepSeq },
          accept: true,
        };
      }
      return {
        state: {
          phase: "confirming",
          seq0: nav.anchorSeq,
          deadlineMs: nowMs + ANCHOR_CONFIRM_TIMEOUT_MS,
        },
        accept: false,
        send: true,
      };

    case "confirming":
      if (nav.anchorSeq !== state.seq0) {
        return {
          state: { phase: "passthrough", confirmedSeq: nav.anchorSeq },
          accept: true,
          anchored: true,
        };
      }
      if (nowMs >= state.deadlineMs) {
        return { state: PASSTHROUGH, accept: true, gaveUp: "timeout" };
      }
      // The same object: a write failure reported later still recognises it.
      return { state, accept: false };
  }
}

/**
 * The write of the command failed (or could not be made). `sent` is the state
 * the step returned along with `send`: only that very anchoring is given up,
 * so a late failure from an earlier connection cannot abort the current one.
 */
export function anchorWriteFailed(
  state: AnchorState,
  sent: AnchorState,
): { state: AnchorState; gaveUp?: AnchorGiveUpReason } {
  if (state !== sent || state.phase !== "confirming") return { state };
  return { state: PASSTHROUGH, gaveUp: "write-failed" };
}
