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
  // {
  //   // "gabriel" is the ambient map soundscape patch, active whenever the globe
  //   // is in view. It receives the current map center so the sound can respond
  //   // to geographic position.
  //   id: "gabriel",
  //   label: "Map sound",
  //   // Built output lives at /public/gabriel-pd4web/
  //   bundleFolder: "gabriel-pd4web",
  //   activation: {
  //     // Active only in the map view, not inside the composition player.
  //     moments: ["map"],
  //   },
  //   binding: {
  //     type: "map-center",
  //     // These receiver names must match [receive x1] and [receive y1] in the .pd file.
  //     longitudeReceiver: "x1",
  //     latitudeReceiver: "y1",
  //     pollMs: DEFAULT_POSITION_POLL_MS,
  //     epsilon: DEFAULT_POSITION_EPSILON,
  //     // Uncomment and add a matching [receive speed] in the patch to enable speed input:
  //     // speedReceiver: "speed",
  //   },
  // },
  // {
  //   id: "gabriel2",
  //   label: "Map sound 2",
  //   bundleFolder: "gabriel2-map",
  //   activation: {
  //     moments: ["map"],
  //   },
  //   binding: {
  //     type: "map-center",
  //     accXReceiver: "aX",

  //     pollMs: DEFAULT_POSITION_POLL_MS,
  //     epsilon: DEFAULT_POSITION_EPSILON,
  //   },
  // },
  //This one is working
  // {
  //   id: "gabriel-paraisoGaia8",
  //   label: "Map sound 3",
  //   bundleFolder: "gabriel-paraisoGaia8_2",
  //   activation: {
  //     moments: ["map"],
  //   },
  //   binding: {
  //     type: "map-center",
  //     latitudeReceiver: "x1",
  //     longitudeReceiver: "y1",
  //     // accXReceiver: "input_accX",
  //     // accYReceiver: "input_accY",
  //     // accZReceiver: "input_accZ",
  //     // co2Receiver: "input_co2",
  //     pollMs: DEFAULT_POSITION_POLL_MS,
  //     epsilon: DEFAULT_POSITION_EPSILON,
  //   },
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
      // co2Receiver: "input_co2",
      pollMs: 64,
      epsilon: 1,
      accEpsilon: 0.05,
    },
  },
] as const;

export function getMap3Pd4WebPatchById(
  patchId: string,
): Map3Pd4WebPatch | null {
  return MAP3_PD4WEB_PATCHES.find((patch) => patch.id === patchId) ?? null;
}

// ---------------------------------------------------------------------------
// Path helpers
// These derive the URLs that Pd4WebMapAudio needs to inject the loader script
// and tell the Emscripten runtime where to fetch its companion files.
// ---------------------------------------------------------------------------

/** Full URL path to the Emscripten loader script for a given bundle. */
export function getPd4WebBundleScriptPath(bundleFolder: string): string {
  return `/${bundleFolder}/pd4web.js`;
}

/**
 * Base URL passed to Emscripten's `locateFile` so it can resolve relative
 * paths for .wasm and .data files bundled alongside pd4web.js.
 */
export function getPd4WebBundleBasePath(bundleFolder: string): string {
  return `/${bundleFolder}/`;
}

/**
 * Returns the HTML id attribute for the <script> tag that loads a patch's
 * runtime. Using a stable id lets us detect an already-injected script on
 * re-mount (e.g. after a React strict-mode double-effect or hot reload).
 */
export function getPd4WebScriptId(patchId: string): string {
  return `map3-pd4web-runtime-${patchId}`;
}

type ResolveMap3Pd4WebPatchOptions = {
  moment: Map3Pd4WebMoment;
  composition: string | null;
};

/**
 * Returns the first patch from MAP3_PD4WEB_PATCHES whose activation rules
 * match the given moment and composition, or null if no patch is applicable.
 *
 * Called by Pd4WebMapAudioManager on every URL state change to decide which
 * (if any) Pd4WebMapAudio instance should be rendered.
 */
export function resolveMap3Pd4WebPatch({
  moment,
  composition,
}: ResolveMap3Pd4WebPatchOptions): Map3Pd4WebPatch | null {
  for (const patch of MAP3_PD4WEB_PATCHES) {
    if (!patch.activation.moments.includes(moment)) {
      continue;
    }

    if (
      patch.activation.compositions &&
      composition &&
      !patch.activation.compositions.includes(composition)
    ) {
      continue;
    }

    if (patch.activation.compositions && !composition) {
      continue;
    }

    return patch;
  }

  return null;
}
