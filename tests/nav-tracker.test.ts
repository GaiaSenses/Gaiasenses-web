import test from "node:test";
import assert from "node:assert/strict";
import {
  NAV_TRACKER_RESET,
  navTrackerReenter,
  navTrackerStep,
  type NavTrackerContext,
  type NavTrackerEffects,
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
const moving = (o: Partial<GaiaballNav> = {}) =>
  nav({ settled: false, moving: true, speedDegS: 40, ...o });
const keepalive = () =>
  nav({ valid: false, settled: false, lat: 0, lon: 0, bearing: 0 });

/** What the hook would do for one event, in a form easy to compare. */
type Effect = "jumpTo" | "motionStop" | "reopenPopup";

/**
 * Drives the tracker like use-ble-sensor.ts does: one state, packets go
 * through navTrackerStep, the gate reopening goes through navTrackerReenter,
 * a (re)connect resets the state. Records the effects of every event.
 */
class Hook {
  state: NavTrackerState = NAV_TRACKER_RESET;
  ctx: NavTrackerContext = {
    gateOpen: true,
    inputMode: "ble",
    urlLat: CAMPINAS.lat,
    urlLng: CAMPINAS.lon,
  };
  jumps: Array<{ center: [number, number]; bearing: number }> = [];

  private apply(fx: NavTrackerEffects): Effect[] {
    this.state = fx.state;
    const out: Effect[] = [];
    if (fx.jumpTo) {
      out.push("jumpTo");
      this.jumps.push(fx.jumpTo);
    }
    if (fx.motionStop) out.push("motionStop");
    if (fx.reopenPopup) out.push("reopenPopup");
    return out;
  }
  connect(): void {
    this.state = NAV_TRACKER_RESET;
  }
  packet(n: GaiaballNav): Effect[] {
    return this.apply(navTrackerStep(this.state, n, this.ctx));
  }
  /** The gate opens again (player → map, auto mode off). */
  reopenGate(): Effect[] {
    this.ctx = { ...this.ctx, gateOpen: true };
    return this.apply(navTrackerReenter(this.state, this.ctx));
  }
}

test("connect at rest away from the URL: one sync, then the map is left alone", () => {
  const h = new Hook();
  h.ctx.urlLat = PARIS.lat;
  h.ctx.urlLng = PARIS.lon;
  h.connect();
  assert.deepEqual(h.packet(nav()), ["jumpTo", "motionStop"]);
  assert.deepEqual(h.jumps[0], {
    center: [CAMPINAS.lon, CAMPINAS.lat],
    bearing: 30,
  });
  // No teleport later: settled packets never move the map in the normal flow.
  for (let i = 0; i < 5; i++) assert.deepEqual(h.packet(nav()), []);
  assert.equal(h.jumps.length, 1);
});

test("connect at rest at the URL location: one sync and the popup comes back", () => {
  const h = new Hook();
  h.connect();
  assert.deepEqual(h.packet(nav({ bearing: -12 })), ["jumpTo", "reopenPopup"]);
  assert.equal(h.jumps[0].bearing, -12);
  assert.deepEqual(h.packet(nav({ bearing: -12 })), []);
});

test("connect while moving: the packets carry on, the stop opens the popup once", () => {
  const h = new Hook();
  h.connect();
  assert.deepEqual(h.packet(moving()), ["jumpTo"]);
  assert.deepEqual(h.packet(nav()), ["jumpTo", "motionStop"]);
  assert.deepEqual(h.packet(nav()), []);
});

test("move then stop: every moving pose is applied, the stop once", () => {
  const h = new Hook();
  h.connect();
  h.packet(nav()); // sync at rest
  const before = h.jumps.length;
  for (let i = 1; i <= 4; i++) {
    assert.deepEqual(h.packet(moving({ lon: CAMPINAS.lon + i })), ["jumpTo"]);
  }
  assert.equal(h.jumps.length, before + 4);
  // The packet that says "stopped" carries the final pose: applied once, then
  // the weather of where it stopped.
  assert.deepEqual(h.packet(nav({ lon: CAMPINAS.lon + 5 })), [
    "jumpTo",
    "motionStop",
  ]);
  assert.deepEqual(h.jumps.at(-1)?.center, [CAMPINAS.lon + 5, CAMPINAS.lat]);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(h.packet(nav({ lon: CAMPINAS.lon + 5 })), []);
  }
});

test("the moving bit plays no part: valid|settled|moving is still at rest", () => {
  const h = new Hook();
  h.connect();
  h.packet(nav());
  assert.deepEqual(h.packet(nav({ moving: true, speedDegS: 8 })), []);
});

test("valid = 0 forgets everything; the next settled packet catches up", () => {
  const h = new Hook();
  h.connect();
  h.packet(nav());
  h.packet(moving({ lat: 10 }));
  assert.deepEqual(h.packet(keepalive()), []);
  assert.deepEqual(h.state, NAV_TRACKER_RESET);
  // A settled pose after the dropout: the same catch-up as a re-entry (here
  // away from the URL, so the location is refreshed)...
  assert.deepEqual(h.packet(nav({ lat: 12 })), ["jumpTo", "motionStop"]);
  assert.deepEqual(h.jumps.at(-1)?.center, [CAMPINAS.lon, 12]);
  // ...and only once.
  assert.deepEqual(h.packet(nav({ lat: 12 })), []);
});

test("valid = 0 then settled at the URL location reopens the popup", () => {
  const h = new Hook();
  h.connect();
  h.packet(nav());
  h.packet(keepalive());
  assert.deepEqual(h.packet(nav()), ["jumpTo", "reopenPopup"]);
});

test("player round trip: packets ignored while it plays, caught up on return", () => {
  const h = new Hook();
  h.connect();
  h.packet(nav()); // at rest in Campinas
  h.ctx.gateOpen = false; // a composition opens (mode=player)
  assert.deepEqual(h.packet(moving({ lat: 0, lon: 0 })), []);
  assert.deepEqual(h.packet(nav({ lat: PARIS.lat, lon: PARIS.lon })), []);
  assert.equal(h.jumps.length, 1);
  // Back to the map: the remembered pose is applied once, away from the URL.
  assert.deepEqual(h.reopenGate(), ["jumpTo", "motionStop"]);
  assert.deepEqual(h.jumps.at(-1)?.center, [PARIS.lon, PARIS.lat]);
  h.ctx.urlLat = PARIS.lat; // handleMotionStop moved the URL
  h.ctx.urlLng = PARIS.lon;
  assert.deepEqual(h.packet(nav({ lat: PARIS.lat, lon: PARIS.lon })), []);
});

test("player round trip, still turning on return: the next stop opens the popup", () => {
  const h = new Hook();
  h.connect();
  h.packet(nav());
  h.ctx.gateOpen = false;
  h.packet(moving({ lat: 5 }));
  assert.deepEqual(h.reopenGate(), ["jumpTo"]);
  assert.deepEqual(h.packet(moving({ lat: 6 })), ["jumpTo"]);
  assert.deepEqual(h.packet(nav({ lat: 7 })), ["jumpTo", "motionStop"]);
});

test("player round trip at the same place: the popup comes back, no refresh", () => {
  const h = new Hook();
  h.connect();
  h.packet(nav());
  h.ctx.gateOpen = false;
  h.packet(nav({ bearing: 90 }));
  assert.deepEqual(h.reopenGate(), ["jumpTo", "reopenPopup"]);
  assert.equal(h.jumps.at(-1)?.bearing, 90);
});

test("gate closed: packets are ignored but the latest valid pose is remembered", () => {
  const h = new Hook();
  h.connect();
  h.ctx.gateOpen = false;
  assert.deepEqual(h.packet(nav({ lat: 1 })), []);
  assert.deepEqual(h.packet(moving({ lat: 2 })), []);
  assert.equal(h.state.latest?.lat, 2);
  assert.equal(h.state.settled, null); // not tracked while closed
  // A keepalive while closed disowns the remembered pose: nothing to catch up.
  h.packet(keepalive());
  assert.deepEqual(h.reopenGate(), []);
  // The tracker is still untracked, so the next settled packet syncs.
  assert.deepEqual(h.packet(nav()), ["jumpTo", "reopenPopup"]);
});

test("mouse input: no packet and no re-entry moves the map", () => {
  const h = new Hook();
  h.ctx.inputMode = "mouse";
  h.connect();
  assert.deepEqual(h.packet(nav({ lat: 3 })), []);
  assert.deepEqual(h.packet(moving({ lat: 4 })), []);
  assert.deepEqual(h.packet(nav({ lat: 5 })), []);
  assert.equal(h.state.latest?.lat, 5); // still remembered
  h.ctx.gateOpen = false;
  assert.deepEqual(h.reopenGate(), []);
  assert.equal(h.jumps.length, 0);
});

test("a re-entry without a remembered pose leaves the state untouched", () => {
  const before: NavTrackerState = { settled: true, latest: null };
  const fx = navTrackerReenter(before, {
    gateOpen: true,
    inputMode: "ble",
    urlLat: 0,
    urlLng: 0,
  });
  assert.deepEqual(fx, { state: before });
});

test("the step never mutates the state it was given", () => {
  const s: NavTrackerState = Object.freeze({ settled: false, latest: null });
  const fx = navTrackerStep(s, nav(), {
    gateOpen: true,
    inputMode: "ble",
    urlLat: 0,
    urlLng: 0,
  });
  assert.equal(fx.state.settled, true);
  assert.equal(s.settled, false);
});
