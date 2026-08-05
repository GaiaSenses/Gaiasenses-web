/**
 * pd4web-patches.ts
 *
 * Types and public accessors for the Pd4Web patch registry.
 *
 * --- Where the data comes from ---
 * The registry itself is NOT written by hand. `pd4web-patches.generated.ts` is
 * produced by `scripts/gen-patch-registry.mjs` from two sources:
 *
 *   1. `patches/<slug>/patch.json` — authorship, label, when the patch is active
 *   2. the patch's own `.pd` files — scanned for `[r gaia.*]` / `[s gaia.*]`
 *
 * That second source is why adding a composition no longer requires editing
 * TypeScript. A musician who writes `[r gaia.temp]` in their patch gets
 * temperature delivered; nobody has to declare it anywhere.
 *
 * --- How Pd4Web works in this project ---
 * Pd4Web compiles a Pure Data patch to WebAssembly via Emscripten. The build
 * output lives under `/public/<bundleFolder>/` and contains:
 *   - pd4web.js    — the Emscripten module loader (an ES module, default export)
 *   - pd4web.data  — the patch itself plus its Libs/ abstractions and audio
 *
 * The `.wasm` is *not* in that folder. Identical runtimes are shared, so it
 * lives at `/pd4web-runtime/<hash>/pd4web.wasm` and `runtime` points at it.
 * `pd4web.threads.js` is served once, globally, from `/pd4webShared/`.
 *
 * --- How to add a new patch ---
 * Drop the project in `patches/<slug>/` (main.pd at the root, abstractions in
 * `Libs/`, a `patch.json` beside them) and open a pull request. CI compiles,
 * validates and registers it. See `docs/musico/README.md`.
 */

import {
  COMPOSITION_PATCH_ID,
  GENERATED_MAP3_PD4WEB_PATCHES,
} from "./pd4web-patches.generated";

export { COMPOSITION_EVENTS, COMPOSITION_PATCH_ID } from "./pd4web-patches.generated";

/**
 * The app-level context in which a patch can be active.
 *   "map"    — the interactive 3-D globe is the primary view
 *   "player" — a visual composition is open in the full-screen player modal
 */
export type Map3Pd4WebMoment = "map" | "player";

/**
 * Maps a vocabulary channel to the receiver name that actually exists in the
 * patch. The two differ for patches written before the vocabulary existed:
 * `paraisoGaia43` listens on `[r latitude]`, so its entry is
 * `{ "gaia.lat": "latitude" }` and the app sends latitude to `"latitude"`.
 *
 * See `lib/gaia-vocabulary.json` for the channel list and their aliases.
 */
export type Map3Pd4WebChannels = {
  /** Channels the app sends into the patch. */
  readonly receivers: Readonly<Record<string, string>>;
  /** Channels the patch sends back to the app. */
  readonly senders: Readonly<Record<string, string>>;
};

/** How aggressively live values are pushed into the patch. */
export type Map3Pd4WebTuning = {
  /**
   * How often (ms) to poll the map centre and sensor. Lower is smoother and
   * costlier; most Pd objects interpolate internally, so this rarely needs to
   * go below the default.
   */
  readonly pollMs: number;
  /**
   * Minimum lat/lng change (degrees) before a new value is sent. Keeps a still
   * map from flooding the patch.
   */
  readonly epsilon: number;
  /** Minimum change before accelerometer and CO₂ values are resent. */
  readonly accEpsilon: number;
};

/**
 * Full descriptor for a single Pd4Web patch.
 *
 * At most one patch is active at a time. `Pd4WebProvider` starts them by id;
 * the map and the composition dropdown decide which id that is.
 */
export type Map3Pd4WebPatch = {
  /** Stable unique identifier, equal to the folder name under `patches/`. */
  readonly id: string;
  /** Human-readable label shown in the UI. */
  readonly label: string;
  /** Build output folder relative to `/public/`, e.g. `patches/thunder4`. */
  readonly bundleFolder: string;
  /**
   * Short hash of the shared WebAssembly runtime, resolving to
   * `/pd4web-runtime/<runtime>/pd4web.wasm`. Absent only before the patch has
   * been built, in which case the loader falls back to the bundle folder.
   */
  readonly runtime?: string;
  readonly activation: {
    /** App moments in which this patch should be loaded and played. */
    readonly moments: readonly Map3Pd4WebMoment[];
    /**
     * Compositions this patch plays with. Derived from the manifest; the live
     * lookup used at runtime is `COMPOSITION_PATCH_ID`.
     */
    readonly compositions?: readonly string[];
  };
  readonly channels: Map3Pd4WebChannels;
  readonly tuning: Map3Pd4WebTuning;
};

/**
 * All Pd4Web patches available in Gaiasenses.
 *
 * Patches are evaluated in order; the first match wins.
 */
export const MAP3_PD4WEB_PATCHES: readonly Map3Pd4WebPatch[] =
  GENERATED_MAP3_PD4WEB_PATCHES;

export function getMap3Pd4WebPatchById(
  patchId: string,
): Map3Pd4WebPatch | null {
  return MAP3_PD4WEB_PATCHES.find((patch) => patch.id === patchId) ?? null;
}

/** The patch that plays with a given composition, if any. */
export function getPatchIdForComposition(
  composition: string,
): string | undefined {
  return (COMPOSITION_PATCH_ID as Record<string, string>)[composition];
}

/** URL of the WebAssembly runtime this patch should load. */
export function getPatchRuntimeUrl(patch: Map3Pd4WebPatch): string {
  return patch.runtime
    ? `/pd4web-runtime/${patch.runtime}/pd4web.wasm`
    : `/${patch.bundleFolder}/pd4web.wasm`;
}

/** True when the app has anything at all to send to this patch. */
export function patchReceivesLiveData(patch: Map3Pd4WebPatch): boolean {
  return Object.keys(patch.channels.receivers).length > 0;
}
