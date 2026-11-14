import test from "node:test";
import assert from "node:assert/strict";
import {
  decideNavReentry,
  REENTRY_LOCATION_EPSILON_DEG,
} from "../app/[locale]/map3/nav-reentry";
import type { GaiaballNav } from "../app/[locale]/map3/ble-decode";

const CAMPINAS = { lat: -22.905556, lon: -47.060833 };

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

test("no pose remembered, or an invalid one → nothing to do", () => {
  assert.equal(decideNavReentry(null, CAMPINAS.lat, CAMPINAS.lon), null);
  assert.equal(
    decideNavReentry(nav({ valid: false }), CAMPINAS.lat, CAMPINAS.lon),
    null,
  );
});

test("the pose is applied as [lon, lat] with its bearing", () => {
  const d = decideNavReentry(nav({ bearing: -135.5 }), 0, 0);
  assert.ok(d);
  assert.deepEqual(d.center, [CAMPINAS.lon, CAMPINAS.lat]);
  assert.equal(d.bearing, -135.5);
});

test("settled away from the URL location → refresh the location", () => {
  const longe = decideNavReentry(nav(), 48.8566, 2.3522);
  assert.ok(longe);
  assert.equal(longe.settled, true);
  assert.equal(longe.refreshLocation, true);

  // just past the threshold, latitude only and longitude only
  const dLat = decideNavReentry(nav(), CAMPINAS.lat + 0.011, CAMPINAS.lon);
  assert.equal(dLat?.refreshLocation, true);
  const dLon = decideNavReentry(nav(), CAMPINAS.lat, CAMPINAS.lon - 0.011);
  assert.equal(dLon?.refreshLocation, true);
});

test("settled at the URL location → apply the pose, keep the location", () => {
  const mesmo = decideNavReentry(nav(), CAMPINAS.lat, CAMPINAS.lon);
  assert.ok(mesmo);
  assert.equal(mesmo.settled, true);
  assert.equal(mesmo.refreshLocation, false);

  const dentro = decideNavReentry(
    nav(),
    CAMPINAS.lat + 0.009,
    CAMPINAS.lon - 0.009,
  );
  assert.equal(dentro?.refreshLocation, false);
  assert.equal(REENTRY_LOCATION_EPSILON_DEG, 0.01);
});

test("longitude is compared across the antimeridian", () => {
  const d = decideNavReentry(nav({ lat: 10, lon: 179.996 }), 10, -179.996);
  assert.equal(d?.refreshLocation, false);
  const e = decideNavReentry(nav({ lat: 10, lon: 179.99 }), 10, -179.99);
  assert.equal(e?.refreshLocation, true);
});

test("not settled → apply the pose and let the packets carry on", () => {
  const d = decideNavReentry(
    nav({ settled: false, moving: true }),
    48.8566,
    2.3522,
  );
  assert.ok(d);
  assert.equal(d.settled, false);
  assert.equal(d.refreshLocation, false);
});

test("the moving bit plays no part (mirror may send valid|settled|moving)", () => {
  const a = decideNavReentry(nav({ moving: true }), 0, 0);
  const b = decideNavReentry(nav({ moving: false }), 0, 0);
  assert.deepEqual(a, b);
});

test("a URL without usable coordinates counts as away", () => {
  assert.equal(
    decideNavReentry(nav(), Number.NaN, CAMPINAS.lon)?.refreshLocation,
    true,
  );
  assert.equal(
    decideNavReentry(nav(), CAMPINAS.lat, Number.NaN)?.refreshLocation,
    true,
  );
});
