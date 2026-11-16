/**
 * What the Gaiaball is saying right now, for any p5 sketch or component.
 *
 *   import { gaiaball } from "@/lib/gaiaball-live";
 *
 *   p5.draw = () => {
 *     const bola = gaiaball.get();
 *     if (bola.connected && bola.imu) { ... bola.imu.acc.x ... }
 *   };
 *
 * Module-level, not React state: the BLE wiring publishes every decoded packet
 * here and nothing re-renders because of it. `get()` hands back the current
 * snapshot as is — no copy, no allocation — so calling it in `draw()` at 60 fps
 * costs nothing. Each publish replaces the snapshot with a new object instead
 * of mutating it, so a snapshot kept by a reader never changes under it and
 * `snapshot !== gaiaball.get()` is a valid "something new arrived" test.
 *
 * Invariant: while `connected` is false, `nav`, `imu` and `co2` are null.
 * Samples published while disconnected are dropped, so a late notification
 * can never leave stale data behind a disconnected ball.
 *
 * READ-ONLY, DO NOT MUTATE. The packets are the very objects the map's Pd loop
 * reads, handed out without a copy; so the snapshot and every packet in it are
 * frozen, all the way down. Writing to them (`bola.imu.acc.x = …`) throws in
 * strict code and is ignored otherwise; a sketch that needs to change a value
 * copies it first.
 */

import type {
  espCo2Response,
  espResponse,
  GaiaballNav,
} from "@/app/[locale]/map3/ble-decode";

export type Nav = GaiaballNav;
export type Imu = espResponse;
export type Co2 = espCo2Response;

export type GaiaballLive = {
  connected: boolean;
  /** Last NavPacket, keepalives (valid = false) included. */
  nav: Nav | null;
  /** Last IMU packet; `imu.audio` only while the microphone envelope is valid. */
  imu: Imu | null;
  /** Last CO2 packet; `co2.trigger` is the ball's own "open a composition". */
  co2: Co2 | null;
  /** Date.now() of the last change. */
  updatedAt: number;
};

type Listener = (snapshot: Readonly<GaiaballLive>) => void;

/**
 * Freezes a decoded packet in place, with every object and array inside it
 * (packets are a few levels of plain data; no cycles). In place, not a copy:
 * the packet is never duplicated, and readers keep getting the same object.
 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

let snapshot: Readonly<GaiaballLive> = Object.freeze({
  connected: false,
  nav: null,
  imu: null,
  co2: null,
  updatedAt: 0,
});

const listeners = new Set<Listener>();

function publish(next: GaiaballLive): void {
  snapshot = Object.freeze(next);
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      // A broken sketch must not break the BLE handler that published.
      console.error("gaiaball-live: listener failed", error);
    }
  }
}

export const gaiaball = {
  get(): Readonly<GaiaballLive> {
    return snapshot;
  },
  /** Called after every change with the new snapshot. Returns the unsubscribe. */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

export function publishGaiaballConnected(connected: boolean): void {
  publish(
    connected
      ? { ...snapshot, connected: true, updatedAt: Date.now() }
      : {
          connected: false,
          nav: null,
          imu: null,
          co2: null,
          updatedAt: Date.now(),
        },
  );
}

export function publishGaiaballNav(nav: Nav): void {
  if (!snapshot.connected) return;
  publish({ ...snapshot, nav: deepFreeze(nav), updatedAt: Date.now() });
}

export function publishGaiaballImu(imu: Imu): void {
  if (!snapshot.connected) return;
  publish({ ...snapshot, imu: deepFreeze(imu), updatedAt: Date.now() });
}

export function publishGaiaballCo2(co2: Co2): void {
  if (!snapshot.connected) return;
  publish({ ...snapshot, co2: deepFreeze(co2), updatedAt: Date.now() });
}
