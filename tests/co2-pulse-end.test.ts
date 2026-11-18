import test from "node:test";
import assert from "node:assert/strict";
import {
  CO2_HOLD_IDLE,
  END_CO2_PULSE_OPCODE,
  co2HoldOnClose,
  co2HoldOnPacket,
  encodeEndCo2PulseCommand,
  sendEndCo2Pulse,
  type Co2HoldState,
} from "../app/[locale]/map3/co2-pulse-end";

/** Feeds a run of trigger levels; returns the last state and every mayOpen. */
function feed(state: Co2HoldState, triggers: boolean[]) {
  const mayOpen: boolean[] = [];
  for (const t of triggers) {
    const r = co2HoldOnPacket(state, t);
    state = r.state;
    mayOpen.push(r.mayOpen);
  }
  return { state, mayOpen };
}

test("0x18 is one byte, no arguments", () => {
  assert.equal(END_CO2_PULSE_OPCODE, 0x18);
  assert.deepEqual([...encodeEndCo2PulseCommand()], [0x18]);
});

test("without a close, the trigger opens as before (the level)", () => {
  const r = feed(CO2_HOLD_IDLE, [false, true, true]);
  assert.deepEqual(r.mayOpen, [false, true, true]);
});

test("a person closes while the trigger is on: end the pulse and hold the trigger", () => {
  const before = feed(CO2_HOLD_IDLE, [true]).state;
  const closed = co2HoldOnClose(before);
  assert.equal(closed.endPulse, true);
  // The rest of the pulse (still trigger = 1 until the ball handles 0x18, or
  // for the whole virtualHoldMs if the 0x18 write fails) cannot reopen it.
  const after = feed(closed.state, [true, true, true]);
  assert.deepEqual(after.mayOpen, [false, false, false]);
});

test("the hold ends when the trigger falls; the next breath opens again", () => {
  const closed = co2HoldOnClose(feed(CO2_HOLD_IDLE, [true]).state).state;
  const r = feed(closed, [true, false, true]);
  assert.deepEqual(r.mayOpen, [false, false, true]);
});

test("the ball closed it (trigger fell): nothing to end, nothing held", () => {
  const before = feed(CO2_HOLD_IDLE, [true, false]).state;
  const closed = co2HoldOnClose(before);
  assert.equal(closed.endPulse, false);
  assert.deepEqual(feed(closed.state, [true]).mayOpen, [true]);
});

test("the ball closed it and a new breath arrived before the URL settled: the breath opens", () => {
  // Pulse over (trigger 0) -> the site closes; a new breath raises trigger 1
  // while the URL is still in player mode. That close was the ball's, not a
  // person's: the new breath must not be held or ended.
  const before = feed(CO2_HOLD_IDLE, [true, false, true]).state;
  const closed = co2HoldOnClose(before, { byTrigger: true });
  assert.equal(closed.endPulse, false);
  assert.deepEqual(feed(closed.state, [true]).mayOpen, [true]);
});

test("a composition opened by hand with the trigger off: closing it ends nothing", () => {
  const closed = co2HoldOnClose(feed(CO2_HOLD_IDLE, [false]).state);
  assert.equal(closed.endPulse, false);
  assert.deepEqual(feed(closed.state, [true]).mayOpen, [true]);
});

test("before any CO2 packet a close ends nothing", () => {
  const closed = co2HoldOnClose(CO2_HOLD_IDLE);
  assert.equal(closed.endPulse, false);
  assert.equal(closed.state.held, false);
});

test("closing twice while held keeps the hold and asks again", () => {
  // A second close while the trigger is still on (the person reopened a
  // composition by hand and closed it): same answer, the hold stays.
  const once = co2HoldOnClose(feed(CO2_HOLD_IDLE, [true]).state);
  const held = feed(once.state, [true]).state;
  const twice = co2HoldOnClose(held);
  assert.equal(twice.endPulse, true);
  assert.deepEqual(feed(twice.state, [true]).mayOpen, [false]);
});

test("the state is never mutated", () => {
  const s = Object.freeze({ ...CO2_HOLD_IDLE });
  co2HoldOnPacket(s, true);
  co2HoldOnClose(Object.freeze({ lastTrigger: true, held: false }));
  assert.deepEqual(s, CO2_HOLD_IDLE);
});

test("sendEndCo2Pulse: one write when it works", async () => {
  const sent: number[][] = [];
  const ok = await sendEndCo2Pulse(async (b) => void sent.push([...b]), async () => {});
  assert.equal(ok, true);
  assert.deepEqual(sent, [[0x18]]);
});

test("sendEndCo2Pulse: a failed write is retried, pausing 250 ms x attempt", async () => {
  // Windows drops ~0.6 % of GATT operations on a healthy link (measured on the
  // ball, 2026-11-18); a write racing the anchor's is refused as in progress.
  let calls = 0;
  const pauses: number[] = [];
  const ok = await sendEndCo2Pulse(
    async () => {
      calls++;
      if (calls < 3) throw new Error("GATT operation failed for unknown reason.");
    },
    async (ms) => void pauses.push(ms),
  );
  assert.equal(ok, true);
  assert.equal(calls, 3);
  assert.deepEqual(pauses, [250, 500]);
});

test("sendEndCo2Pulse: gives up after 3 attempts and reports it (never throws)", async () => {
  let calls = 0;
  const ok = await sendEndCo2Pulse(
    async () => {
      calls++;
      throw new Error("NetworkError");
    },
    async () => {},
  );
  assert.equal(ok, false);
  assert.equal(calls, 3);
});
