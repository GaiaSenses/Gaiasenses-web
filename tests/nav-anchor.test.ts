import test from "node:test";
import assert from "node:assert/strict";
import {
  ANCHOR_CONFIRM_TIMEOUT_MS,
  ANCHOR_IDLE,
  anchorConfirmedSeq,
  anchorStart,
  anchorStep,
  anchorWriteFailed,
  encodeAnchorCommand,
  type AnchorState,
  type AnchorStep,
} from "../app/[locale]/map3/nav-anchor";
import {
  NAV_TRACKER_RESET,
  navTrackerStep,
  type NavTrackerContext,
  type NavTrackerState,
} from "../app/[locale]/map3/nav-tracker";
import type { GaiaballNav } from "../app/[locale]/map3/ble-decode";

const CAMPINAS = { lat: -22.905556, lon: -47.060833 };
const PARIS = { lat: 48.8566, lon: 2.3522 };

function nav(overrides: Partial<GaiaballNav> = {}): GaiaballNav {
  return {
    mode: 1,
    valid: true,
    settled: true,
    moving: false,
    lat: CAMPINAS.lat,
    lon: CAMPINAS.lon,
    bearing: 30,
    speedDegS: 0,
    seq: 1,
    tUs: 1,
    ...overrides,
  };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

/** The command's fields as the ball reads them. */
function fields(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    opcode: dv.getUint8(0),
    latE6: dv.getInt32(1, true),
    lonE6: dv.getInt32(5, true),
    bearingX100: dv.getInt16(9, true),
  };
}

// ---------------------------------------------------------------------------
// encodeAnchorCommand
// ---------------------------------------------------------------------------

// Golden vectors, verbatim from the protocol contract shared with the firmware.
test("golden vector: São Paulo, bearing 12.34°", () => {
  assert.equal(
    toHex(encodeAnchorCommand(-23.55052, -46.633308, 12.34)),
    "17 c8 a5 98 fe a4 6e 38 fd d2 04",
  );
});

test("golden vector: Paris, bearing −90°", () => {
  assert.equal(
    toHex(encodeAnchorCommand(48.8566, 2.3522, -90)),
    "17 18 7e e9 02 48 e4 23 00 d8 dc",
  );
});

test("the command is 11 bytes: opcode 0x17, latE6, lonE6, bearingX100", () => {
  const bytes = encodeAnchorCommand(1.5, -2.25, 3.5);
  assert.equal(bytes.byteLength, 11);
  assert.deepEqual(fields(bytes), {
    opcode: 0x17,
    latE6: 1500000,
    lonE6: -2250000,
    bearingX100: 350,
  });
});

test("longitude is normalized into (−180, 180]", () => {
  const lonE6 = (lon: number) => fields(encodeAnchorCommand(0, lon, 0)).lonE6;
  assert.equal(lonE6(180), 180000000);
  assert.equal(lonE6(-180), 180000000);
  assert.equal(lonE6(540), 180000000);
  assert.equal(lonE6(190), -170000000);
  assert.equal(lonE6(-190), 170000000);
  assert.equal(lonE6(-370), -10000000);
  // a value that only rounds onto −180 is still sent as 180
  assert.equal(lonE6(-179.9999996), 180000000);
});

test("bearing is normalized into (−180, 180]", () => {
  const bx100 = (b: number) => fields(encodeAnchorCommand(0, 0, b)).bearingX100;
  assert.equal(bx100(-180), 18000);
  assert.equal(bx100(180), 18000);
  assert.equal(bx100(360), 0);
  assert.equal(bx100(270), -9000);
  assert.equal(bx100(-270), 9000);
  assert.equal(bx100(179.996), 18000);
  assert.equal(bx100(-179.996), 18000);
});

test("latitude is clamped to [−90, 90]", () => {
  const latE6 = (lat: number) => fields(encodeAnchorCommand(lat, 0, 0)).latE6;
  assert.equal(latE6(90), 90000000);
  assert.equal(latE6(95), 90000000);
  assert.equal(latE6(-90), -90000000);
  assert.equal(latE6(-100), -90000000);
});

// ---------------------------------------------------------------------------
// The anchoring state machine
// ---------------------------------------------------------------------------

test("old firmware (no anchorSeq): every packet passes, nothing is sent", () => {
  let s = anchorStart(true);
  for (let i = 0; i < 4; i++) {
    const step = anchorStep(s, nav({ seq: i }), i * 20);
    assert.deepEqual(step, { state: step.state, accept: true });
    s = step.state;
  }
});

test("anchor firmware: the first packet asks for the anchor and is dropped", () => {
  const step = anchorStep(anchorStart(true), nav({ anchorSeq: 4 }), 1000);
  assert.equal(step.accept, false);
  assert.equal(step.send, true);
  assert.equal(step.anchored, undefined);
  assert.equal(step.gaveUp, undefined);
});

test("packets are dropped until anchorSeq changes; then everything passes", () => {
  let step = anchorStep(anchorStart(true), nav({ anchorSeq: 4 }), 0);
  for (let t = 20; t < 400; t += 20) {
    step = anchorStep(step.state, nav({ anchorSeq: 4 }), t);
    assert.deepEqual(step, { state: step.state, accept: false });
  }
  step = anchorStep(step.state, nav({ anchorSeq: 5, lat: PARIS.lat }), 400);
  assert.deepEqual(step, { state: step.state, accept: true, anchored: true });
  // from then on, plain passthrough — even if anchorSeq changes again
  for (const seq of [5, 6, 6]) {
    step = anchorStep(step.state, nav({ anchorSeq: seq }), 10_000);
    assert.deepEqual(step, { state: step.state, accept: true });
  }
});

test("only one anchor is asked for per connection", () => {
  let step = anchorStep(anchorStart(true), nav({ anchorSeq: 0 }), 0);
  let sends = step.send ? 1 : 0;
  for (let t = 20; t <= 3000; t += 20) {
    step = anchorStep(step.state, nav({ anchorSeq: t < 200 ? 0 : 1 }), t);
    if (step.send) sends++;
  }
  assert.equal(sends, 1);
});

test("anchorSeq wraps: seq0 255 → 0 counts as changed", () => {
  let step = anchorStep(anchorStart(true), nav({ anchorSeq: 255 }), 0);
  step = anchorStep(step.state, nav({ anchorSeq: 255 }), 20);
  assert.equal(step.accept, false);
  step = anchorStep(step.state, nav({ anchorSeq: 0 }), 40);
  assert.equal(step.accept, true);
  assert.equal(step.anchored, true);
});

test("no confirmation within the timeout: give up once, packets flow", () => {
  let step = anchorStep(anchorStart(true), nav({ anchorSeq: 9 }), 1000);
  step = anchorStep(
    step.state,
    nav({ anchorSeq: 9 }),
    1000 + ANCHOR_CONFIRM_TIMEOUT_MS - 1,
  );
  assert.equal(step.accept, false);
  step = anchorStep(
    step.state,
    nav({ anchorSeq: 9 }),
    1000 + ANCHOR_CONFIRM_TIMEOUT_MS,
  );
  assert.deepEqual(step, {
    state: step.state,
    accept: true,
    gaveUp: "timeout",
  });
  // given up for good: no second warning, no late "anchored"
  step = anchorStep(step.state, nav({ anchorSeq: 10 }), 9000);
  assert.deepEqual(step, { state: step.state, accept: true });
});

test("the timeout is 1500 ms", () => {
  assert.equal(ANCHOR_CONFIRM_TIMEOUT_MS, 1500);
});

test("a confirmation that arrives late still counts as anchored", () => {
  // The timeout is only seen on a packet: if the confirming packet is the
  // first one after the deadline, the ball did anchor — take it.
  let step = anchorStep(anchorStart(true), nav({ anchorSeq: 1 }), 0);
  step = anchorStep(step.state, nav({ anchorSeq: 2 }), 5000);
  assert.deepEqual(step, { state: step.state, accept: true, anchored: true });
});

test("write failure: give up once, the next packets flow", () => {
  const sent = anchorStep(anchorStart(true), nav({ anchorSeq: 3 }), 0);
  assert.equal(sent.send, true);
  const failed = anchorWriteFailed(sent.state, sent.state);
  assert.equal(failed.gaveUp, "write-failed");
  const step = anchorStep(failed.state, nav({ anchorSeq: 3 }), 40);
  assert.deepEqual(step, { state: step.state, accept: true });
  // a second report of the same failure does not warn again
  assert.equal(anchorWriteFailed(failed.state, sent.state).gaveUp, undefined);
});

test("write failure reported after a few dropped packets still gives up", () => {
  // The write is async: packets keep arriving (and being dropped) before it
  // rejects, and the failure must still be recognised as this anchoring's.
  const sent = anchorStep(anchorStart(true), nav({ anchorSeq: 3 }), 0);
  let now = sent.state;
  for (let t = 20; t <= 100; t += 20) {
    now = anchorStep(now, nav({ anchorSeq: 3 }), t).state;
  }
  const failed = anchorWriteFailed(now, sent.state);
  assert.equal(failed.gaveUp, "write-failed");
  const next = anchorStep(failed.state, nav({ anchorSeq: 3 }), 120);
  assert.equal(next.accept, true);
});

test("a stale write failure (an earlier connection) is ignored", () => {
  const old = anchorStep(anchorStart(true), nav({ anchorSeq: 3 }), 0);
  // reconnect: a new anchoring that has already sent its own command
  const current = anchorStep(anchorStart(true), nav({ anchorSeq: 3 }), 2000);
  const r = anchorWriteFailed(current.state, old.state);
  assert.equal(r.gaveUp, undefined);
  assert.equal(r.state, current.state);
  assert.equal(anchorStep(r.state, nav({ anchorSeq: 3 }), 2020).accept, false);
});

test("a write failure after the confirmation changes nothing", () => {
  const sent = anchorStep(anchorStart(true), nav({ anchorSeq: 3 }), 0);
  const anchored = anchorStep(sent.state, nav({ anchorSeq: 4 }), 100);
  const r = anchorWriteFailed(anchored.state, sent.state);
  assert.deepEqual(r, { state: anchored.state });
});

test("no command characteristic: give up at once, nothing dropped", () => {
  let step = anchorStep(anchorStart(false), nav({ anchorSeq: 3 }), 0);
  assert.deepEqual(step, {
    state: step.state,
    accept: true,
    gaveUp: "no-command-characteristic",
  });
  step = anchorStep(step.state, nav({ anchorSeq: 3 }), 20);
  assert.deepEqual(step, { state: step.state, accept: true });
  // and an old firmware without it is just the old firmware: no warning
  step = anchorStep(anchorStart(false), nav(), 0);
  assert.deepEqual(step, { state: step.state, accept: true });
});

test("idle (no connect yet, or after a disconnect): packets pass, nothing sent", () => {
  const step = anchorStep(ANCHOR_IDLE, nav({ anchorSeq: 3 }), 0);
  assert.deepEqual(step, { state: ANCHOR_IDLE, accept: true });
});

test("the step never mutates the state it was given", () => {
  const s: AnchorState = Object.freeze(anchorStart(true));
  const step = anchorStep(s, nav({ anchorSeq: 1 }), 0);
  assert.notEqual(step.state, s);
  assert.deepEqual(s, anchorStart(true));
});

// ---------------------------------------------------------------------------
// Automatic reconnect: no new anchor while the ball still holds this page's
// ---------------------------------------------------------------------------

/** A connection anchored by this page: the ball confirmed with `seq`. */
function confirmed(seq: number): AnchorState {
  const sent = anchorStep(anchorStart(true), nav({ anchorSeq: seq - 1 }), 0);
  const done = anchorStep(sent.state, nav({ anchorSeq: seq }), 20);
  assert.equal(done.anchored, true);
  return done.state;
}

test("the confirmed anchorSeq is remembered in the state", () => {
  assert.equal(anchorConfirmedSeq(confirmed(5)), 5);
  // nothing confirmed: idle, waiting, confirming, given up, old firmware
  assert.equal(anchorConfirmedSeq(ANCHOR_IDLE), undefined);
  assert.equal(anchorConfirmedSeq(anchorStart(true)), undefined);
  const sent = anchorStep(anchorStart(true), nav({ anchorSeq: 4 }), 0);
  assert.equal(anchorConfirmedSeq(sent.state), undefined);
  const late = anchorStep(sent.state, nav({ anchorSeq: 4 }), 5000);
  assert.equal(late.gaveUp, "timeout");
  assert.equal(anchorConfirmedSeq(late.state), undefined);
  assert.equal(
    anchorConfirmedSeq(anchorWriteFailed(sent.state, sent.state).state),
    undefined,
  );
  const noChar = anchorStep(anchorStart(false), nav({ anchorSeq: 4 }), 0);
  assert.equal(anchorConfirmedSeq(noChar.state), undefined);
  const old = anchorStep(anchorStart(true), nav(), 0);
  assert.equal(anchorConfirmedSeq(old.state), undefined);
});

test("auto-reconnect, same anchorSeq: the ball kept our anchor, packets pass, nothing sent", () => {
  const lastConfirmedSeq = anchorConfirmedSeq(confirmed(5));
  let step = anchorStep(
    anchorStart(true, { reconnect: true, lastConfirmedSeq }),
    nav({ anchorSeq: 5 }),
    0,
  );
  assert.deepEqual(step, { state: step.state, accept: true });
  for (let t = 20; t <= 100; t += 20) {
    step = anchorStep(step.state, nav({ anchorSeq: 5 }), t);
    assert.deepEqual(step, { state: step.state, accept: true });
  }
  // still ours: a further drop and reconnect keeps skipping
  assert.equal(anchorConfirmedSeq(step.state), 5);
});

test("auto-reconnect, different anchorSeq (reboot, or another client anchored): anchors again", () => {
  for (const seq of [0, 6]) {
    const step = anchorStep(
      anchorStart(true, { reconnect: true, lastConfirmedSeq: 5 }),
      nav({ anchorSeq: seq }),
      0,
    );
    assert.equal(step.accept, false);
    assert.equal(step.send, true);
    // the earlier confirmation no longer describes the ball
    assert.equal(anchorConfirmedSeq(step.state), undefined);
  }
});

test("manual connect, same anchorSeq: always anchors", () => {
  const step = anchorStep(
    anchorStart(true, { reconnect: false, lastConfirmedSeq: 5 }),
    nav({ anchorSeq: 5 }),
    0,
  );
  assert.equal(step.accept, false);
  assert.equal(step.send, true);
});

test("auto-reconnect with nothing confirmed yet: anchors", () => {
  const step = anchorStep(
    anchorStart(true, { reconnect: true, lastConfirmedSeq: undefined }),
    nav({ anchorSeq: 5 }),
    0,
  );
  assert.equal(step.accept, false);
  assert.equal(step.send, true);
});

test("auto-reconnect to an older firmware (no anchorSeq): packets pass as before", () => {
  const step = anchorStep(
    anchorStart(true, { reconnect: true, lastConfirmedSeq: 5 }),
    nav(),
    0,
  );
  assert.deepEqual(step, { state: step.state, accept: true });
  assert.equal(anchorConfirmedSeq(step.state), undefined);
});

// ---------------------------------------------------------------------------
// Anchor + tracker, wired like use-ble-sensor.ts: connect resets both, each
// NavPacket goes through the anchor step first, a dropped packet never reaches
// the tracker, and the confirmation resets the tracker before it passes.
// ---------------------------------------------------------------------------

type Effect = "jumpTo" | "motionStop" | "reopenPopup";

class Link {
  anchor: AnchorState = anchorStart(true);
  tracker: NavTrackerState = NAV_TRACKER_RESET;
  ctx: NavTrackerContext;
  /** The map's current view (centre and bearing). */
  view: { lat: number; lon: number; bearing: number };
  sent: Uint8Array[] = [];
  jumps: Array<{ center: [number, number]; bearing: number }> = [];
  delivered: GaiaballNav[] = [];

  constructor(at: { lat: number; lon: number }, bearing = 0) {
    this.ctx = {
      gateOpen: true,
      inputMode: "controller",
      urlLat: at.lat,
      urlLng: at.lon,
    };
    this.view = { ...at, bearing };
  }
  connect(canWrite = true, reconnect = false): void {
    this.anchor = anchorStart(canWrite, {
      reconnect,
      lastConfirmedSeq: anchorConfirmedSeq(this.anchor),
    });
    this.tracker = NAV_TRACKER_RESET;
  }
  packet(n: GaiaballNav, nowMs = 0): Effect[] | "dropped" {
    const a: AnchorStep = anchorStep(this.anchor, n, nowMs);
    this.anchor = a.state;
    if (a.send) {
      this.sent.push(
        encodeAnchorCommand(this.view.lat, this.view.lon, this.view.bearing),
      );
    }
    if (!a.accept) return "dropped";
    if (a.anchored) this.tracker = NAV_TRACKER_RESET;
    this.delivered.push(n);
    const fx = navTrackerStep(this.tracker, n, this.ctx);
    this.tracker = fx.state;
    const out: Effect[] = [];
    if (fx.jumpTo) {
      out.push("jumpTo");
      this.jumps.push(fx.jumpTo);
    }
    if (fx.motionStop) out.push("motionStop");
    if (fx.reopenPopup) out.push("reopenPopup");
    return out;
  }
}

/** What an anchored ball reports right after applying the command. */
function poseOfCommand(bytes: Uint8Array, anchorSeq: number): GaiaballNav {
  const f = fields(bytes);
  return nav({
    lat: f.latE6 / 1e6,
    lon: f.lonE6 / 1e6,
    bearing: f.bearingX100 / 100,
    anchorSeq,
  });
}

test("old firmware, URL at Paris: connect still jumps to the ball's Campinas", () => {
  const link = new Link(PARIS);
  link.connect();
  assert.deepEqual(link.packet(nav()), ["jumpTo", "motionStop"]);
  assert.deepEqual(link.jumps[0], {
    center: [CAMPINAS.lon, CAMPINAS.lat],
    bearing: 30,
  });
  assert.equal(link.sent.length, 0);
});

test("anchor firmware, map at Paris: the ball is anchored there, no jump", () => {
  const link = new Link(PARIS, -90);
  link.connect();
  // The ball still reports its old reference (Campinas) until it anchors.
  assert.equal(link.packet(nav({ anchorSeq: 7 }), 0), "dropped");
  assert.equal(link.sent.length, 1);
  assert.equal(toHex(link.sent[0]), "17 18 7e e9 02 48 e4 23 00 d8 dc");
  assert.equal(link.packet(nav({ anchorSeq: 7 }), 20), "dropped");
  assert.equal(link.delivered.length, 0);
  assert.equal(link.jumps.length, 0);

  // The first packet after the anchor reports exactly the map's view: the
  // tracker sees the URL location, so it only brings the popup back.
  assert.deepEqual(link.packet(poseOfCommand(link.sent[0], 8), 60), [
    "jumpTo",
    "reopenPopup",
  ]);
  const [lon, lat] = link.jumps[0].center;
  assert.ok(Math.abs(lat - PARIS.lat) < 1e-6);
  assert.ok(Math.abs(lon - PARIS.lon) < 1e-6);
  assert.equal(link.jumps[0].bearing, -90);
  // and the flow carries on from there as before
  assert.deepEqual(
    link.packet(nav({ settled: false, lat: 50, lon: 3, anchorSeq: 8 }), 80),
    ["jumpTo"],
  );
  assert.equal(link.sent.length, 1);
});

test("anchor firmware, timeout: the old sync jump happens after all", () => {
  const link = new Link(PARIS);
  link.connect();
  assert.equal(link.packet(nav({ anchorSeq: 7 }), 0), "dropped");
  assert.equal(link.packet(nav({ anchorSeq: 7 }), 1000), "dropped");
  assert.deepEqual(link.packet(nav({ anchorSeq: 7 }), 1500), [
    "jumpTo",
    "motionStop",
  ]);
  assert.deepEqual(link.jumps[0].center, [CAMPINAS.lon, CAMPINAS.lat]);
});

test("connecting again by hand anchors again, to where the map is now", () => {
  const link = new Link(PARIS);
  link.connect();
  link.packet(nav({ anchorSeq: 1 }), 0);
  link.packet(poseOfCommand(link.sent[0], 2), 20);
  // the ball moved the globe to Campinas, then the visitor connected again
  link.view = { ...CAMPINAS, bearing: 15 };
  link.ctx.urlLat = CAMPINAS.lat;
  link.ctx.urlLng = CAMPINAS.lon;
  link.connect();
  assert.equal(
    link.packet(nav({ lat: 0, lon: 0, anchorSeq: 2 }), 5000),
    "dropped",
  );
  assert.equal(link.sent.length, 2);
  assert.deepEqual(fields(link.sent[1]), {
    opcode: 0x17,
    latE6: Math.round(CAMPINAS.lat * 1e6),
    lonE6: Math.round(CAMPINAS.lon * 1e6),
    bearingX100: 1500,
  });
  assert.deepEqual(link.packet(poseOfCommand(link.sent[1], 3), 5040), [
    "jumpTo",
    "reopenPopup",
  ]);
});

test("an automatic reconnect to a ball that kept our anchor sends nothing and follows it", () => {
  const link = new Link(PARIS);
  link.connect();
  link.packet(nav({ anchorSeq: 1 }), 0);
  link.packet(poseOfCommand(link.sent[0], 2), 20);
  // the visitor kept turning the ball through the link drop
  link.connect(true, true);
  const moved = nav({ settled: false, lat: 50, lon: 3, anchorSeq: 2 });
  assert.deepEqual(link.packet(moved, 5000), ["jumpTo"]);
  assert.equal(link.sent.length, 1);
  assert.deepEqual(link.jumps.at(-1)?.center, [3, 50]);
});

test("an automatic reconnect after the ball rebooted anchors again", () => {
  const link = new Link(PARIS);
  link.connect();
  link.packet(nav({ anchorSeq: 1 }), 0);
  link.packet(poseOfCommand(link.sent[0], 2), 20);
  link.connect(true, true);
  // rebooted: anchorSeq back to 0, pose relative to Campinas again
  assert.equal(link.packet(nav({ anchorSeq: 0 }), 5000), "dropped");
  assert.equal(link.sent.length, 2);
  assert.deepEqual(link.packet(poseOfCommand(link.sent[1], 1), 5040), [
    "jumpTo",
    "reopenPopup",
  ]);
});
