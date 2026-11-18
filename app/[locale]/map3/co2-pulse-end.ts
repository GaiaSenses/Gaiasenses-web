/**
 * A person closed the composition the ball's CO2 trigger opened.
 *
 * The site follows the trigger LEVEL (use-ble-sensor.ts): trigger = 1 with no
 * composition playing opens one. A breath raises a virtual CO2 pulse on the
 * ball that keeps the trigger on for virtualHoldMs (seconds), so a person who
 * closes the composition — clicking the screen, the Back button or ESC — saw
 * it reopen on the next CO2 packet, until the pulse ran out.
 *
 * On such a close, while the trigger is on:
 *  - command 0x18 asks the ball to end the pulse now: the ppm it reports goes
 *    back to the real reading and the trigger falls (firmware without 0x18
 *    ignores it and the pulse runs its course);
 *  - the trigger is HELD here: it cannot open a composition again until a
 *    packet reports it off. That covers the packets already in flight before
 *    the ball handles 0x18, firmware without 0x18, and a real reading still
 *    above the threshold. The next breath after the fall opens normally.
 *
 * The ball's own close (trigger fell) is not a person's: nothing to end,
 * nothing to hold — even if a new breath raised the trigger again before the
 * URL settled (that breath must open the next composition).
 *
 * Pure module (no React, no BLE): importable from node:test.
 */

/** Command opcode, written to the command characteristic (…0002). No PIN. */
export const END_CO2_PULSE_OPCODE = 0x18;

/** One byte, no arguments. */
export function encodeEndCo2PulseCommand(): Uint8Array {
  return Uint8Array.of(END_CO2_PULSE_OPCODE);
}

export type Co2HoldState = {
  /** Trigger level of the last CO2 packet (false before any). */
  readonly lastTrigger: boolean;
  /** A person closed the composition with the trigger on; released when it falls. */
  readonly held: boolean;
};

export const CO2_HOLD_IDLE: Co2HoldState = { lastTrigger: false, held: false };

/**
 * Every CO2 packet. `mayOpen`: whether this trigger level may open a
 * composition. Closing on trigger = 0 is not affected by the hold.
 */
export function co2HoldOnPacket(
  state: Co2HoldState,
  trigger: boolean,
): { state: Co2HoldState; mayOpen: boolean } {
  const held = state.held && trigger;
  return { state: { lastTrigger: trigger, held }, mayOpen: trigger && !held };
}

/**
 * The composition closed (the URL left player mode). `endPulse`: send 0x18.
 * `byTrigger`: the site closed it itself because the trigger fell. Otherwise
 * (a click, Back, ESC, anything else) a trigger still on would reopen it.
 */
export function co2HoldOnClose(
  state: Co2HoldState,
  { byTrigger = false }: { byTrigger?: boolean } = {},
): { state: Co2HoldState; endPulse: boolean } {
  if (byTrigger || !state.lastTrigger) return { state, endPulse: false };
  return { state: { lastTrigger: true, held: true }, endPulse: true };
}

/** Attempts per 0x18 write, and the pause before the next one (x attempt number). */
const END_PULSE_ATTEMPTS = 3;
const END_PULSE_RETRY_MS = 250;

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Writes 0x18, retrying a failed write (same policy as the config-app: 3
 * attempts, 250 ms x attempt between them). Windows drops a fraction of GATT
 * operations on a healthy link, and a write that races the anchor's is
 * refused as in progress. Never throws: false = not delivered, and the hold
 * still keeps the composition closed until the pulse runs out.
 */
export async function sendEndCo2Pulse(
  write: (bytes: Uint8Array) => Promise<void>,
  sleep: (ms: number) => Promise<void> = pause,
): Promise<boolean> {
  for (let attempt = 1; ; attempt++) {
    try {
      await write(encodeEndCo2PulseCommand());
      return true;
    } catch {
      if (attempt >= END_PULSE_ATTEMPTS) return false;
      await sleep(END_PULSE_RETRY_MS * attempt);
    }
  }
}
