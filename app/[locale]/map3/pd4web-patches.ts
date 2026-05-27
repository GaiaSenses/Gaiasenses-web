/**
 * pd4web-patches.ts
 *
 * Central registry of all Pd4Web patches used by the Gaiasenses map.
 *
 * --- How Pd4Web works in this project ---
 * Pd4Web compiles a Pure Data (.pd) patch to WebAssembly via Emscripten.
 * The build output lives under /public/<bundleFolder>/ and contains:
 *   - pd4web.js      — the Emscripten module loader (sets window.Pd4WebModule)
 *   - pd4web.wasm    — the compiled patch + libpd runtime
 *   - pd4web.data    — any embedded audio files / abstractions
 *
 * At runtime the loader script is injected into <body> as a <script> tag by
 * Pd4WebMapAudio. Once loaded it exposes window.Pd4WebModule(), a factory that
 * instantiates the Pd4Web class. Calling pd.init() starts the Web Audio context
 * and begins processing the patch.
 *
 * --- How to add a new patch ---
 * 1. Build the patch with Pd4Web and copy the output folder to /public/.
 * 2. Add an entry to MAP3_PD4WEB_PATCHES below.
 * 3. Set `activation.moments` to control when the patch is loaded:
 *      "map"    — active while the globe is visible (no composition playing)
 *      "player" — active while a visual composition is open
 *    Optionally restrict to specific compositions via `activation.compositions`.
 * 4. Set `binding` to describe what live data Pd4WebMapAudio should forward into
 *    the patch via pd.sendFloat(). Use "none" if the patch needs no live data.
 *
 * --- Receiver names ---
 * A "receiver" is a named inlet in the Pure Data patch (e.g. [receive x1]).
 * The names in the binding object must exactly match those declared in the .pd file.
 */

/**
 * The app-level context in which a patch can be active.
 *   "map"    — the interactive 3-D globe is the primary view
 *   "player" — a visual composition is open in the full-screen player modal
 */
export type Map3Pd4WebMoment = "map" | "player";

/**
 * Describes how Pd4WebMapAudio should feed live data into the patch.
 *
 * "map-center" — polls the Mapbox map center on an interval and forwards
 *   lat/lng (and optionally rotation speed) as floats to named pd receivers.
 *
 * "none" — the patch manages its own audio without any live data input from
 *   the map. Use this for patches that only react to user gestures or BLE.
 */
export type Map3Pd4WebBinding =
  | {
      type: "map-center";
      /** Name of the [receive] object in the .pd patch that accepts longitude (−180 … 180). */
      longitudeReceiver?: string;
      /** Name of the [receive] object in the .pd patch that accepts latitude (−90 … 90). */
      latitudeReceiver?: string;
      accXReceiver?: string;
      accYReceiver?: string;
      accZReceiver?: string;
      co2Receiver?: string;
      /** Receiver that accepts app->Pd sensor packets as a list. */
      sensorListReceiver?: string;
      /** Symbol name used by Pd->app list output callbacks. */
      outputListReceiver?: string;
      /**
       * Optional receiver name for globe rotation speed in degrees/second.
       * The value is a cos-corrected angular speed computed from successive map
       * center positions, so it is scale-invariant regardless of zoom level.
       * Leave undefined if the patch does not need speed data.
       */
      speedReceiver?: string;
      /**
       * How often (in ms) to poll the map center and push values to the patch.
       * Defaults to 100 ms (10 Hz). Increase for less CPU usage; decrease for
       * smoother parameter modulation inside pd (not usually necessary since
       * most pd objects interpolate internally).
       */
      pollMs?: number;
      /**
       * Minimum positional change (in degrees) required before a new sendFloat
       * is dispatched. Prevents unnecessary messages when the map is stationary.
       * Defaults to 0.0001° (≈ 10 m at the equator).
       */
      epsilon?: number;

      /**
       * Minimun acceleration change required before a new sendFloat is dispatched.
       * Prevents unnecessary messages when the device is stationary.
       * Defaults to 0.5.
       */
      accEpsilon?: number;
    }
  | {
      type: "none";
    };

/**
 * Full descriptor for a single Pd4Web patch registered with Gaiasenses.
 *
 * At most one patch is active at any moment; Pd4WebMapAudioManager picks the
 * first entry in MAP3_PD4WEB_PATCHES whose activation rules match the current
 * URL state (mode + composition query params).
 */
export type Map3Pd4WebPatch = {
  /** Stable unique identifier. Used to key the React component and derive the <script> tag id. */
  id: string;
  /** Human-readable label shown on the Play/Pause button in the UI. */
  label: string;
  /** Name of the output folder produced by the Pd4Web build, relative to /public/. */
  bundleFolder: string;
  activation: {
    /** App moments in which this patch should be loaded and played. */
    moments: Map3Pd4WebMoment[];
    /**
     * If provided, the patch is only active when one of these composition keys
     * is present in the URL's `composition` query param.
     * Omit to activate for all compositions within the listed moments.
     */
    compositions?: string[];
  };
  /** Specifies what live map data (if any) is forwarded into the patch. */
  binding: Map3Pd4WebBinding;
};

/** Interval between position polls in milliseconds. 32 ms = 30 Hz. */
const DEFAULT_POSITION_POLL_MS = 300;

/**
 * Minimum lat/lng delta (degrees) that triggers a sendFloat call.
 * 0.0001° ≈ 11 m at the equator — fine enough to track slow globe drags.
 */
const DEFAULT_POSITION_EPSILON = 0.0001;

/**
 * All Pd4Web patches available in Gaiasenses.
 *
 * Patches are evaluated in order; the first match wins.
 * Add new patches here following the Map3Pd4WebPatch shape described above.
 */
export const MAP3_PD4WEB_PATCHES: readonly Map3Pd4WebPatch[] = [
  {
    id: "thunder4",
    label: "Thunder 4",
    bundleFolder: "thunder4",
    activation: {
      moments: ["player"],
      compositions: ["lightningBolts"],
    },
    binding: {
      type: "none",
    },
  },
  {
    id: "bubble1",
    label: "Bubble 1",
    bundleFolder: "bubble1",
    activation: {
      moments: ["player"],
      compositions: ["lluvia"],
    },
    binding: {
      type: "none",
    },
  },
  {
    id: "paraiso32",
    label: "Map sound 32",
    bundleFolder: "paraiso32",
    activation: {
      // Keep this patch addressable in player mode too. Gating pause/resume is
      // handled in GaiasensesMap via the composition's `pd4web` flag.
      moments: ["map", "player"],
    },
    binding: {
      type: "map-center",
      latitudeReceiver: "lati",
      longitudeReceiver: "rotacaoSite",
      accXReceiver: "aceX",
      accYReceiver: "aceY",
      accZReceiver: "aceZ",
      co2Receiver: "input_co2",
      sensorListReceiver: "r_input",
      outputListReceiver: "r_output",
      pollMs: 64,
      epsilon: 0.5,
      accEpsilon: 0.05,
    },
  },
] as const;

export function getMap3Pd4WebPatchById(
  patchId: string,
): Map3Pd4WebPatch | null {
  return MAP3_PD4WEB_PATCHES.find((patch) => patch.id === patchId) ?? null;
}
