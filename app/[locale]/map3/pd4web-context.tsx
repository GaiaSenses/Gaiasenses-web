"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  getMap3Pd4WebPatchById,
  getPatchRuntimeUrl,
  type Map3Pd4WebPatch,
} from "./pd4web-patches";

const P4DWEB_CANVAS_ID = "pd4web-canvas";

/**
 * The element Pd4Web binds its own audio toggle to.
 *
 * Without a `soundToggleId` every patch logs an error to the console —
 * "You don't assigned any sound toggle id, you need to run Pd4Web.init() from
 * a click event!" — which is noise that hides real errors. Pd4Web wants a DOM
 * node it can hang a click listener and a speaker icon on; this app starts the
 * audio itself from the click that opens the work, so the node it gets is a
 * dedicated one, kept out of sight and out of reach. Pd4Web paints a
 * background image on it and toggles a `pulse-icon` class, so it must stay in
 * the DOM for as long as a patch is loaded: three of the four handlers that
 * touch it do not check for null and would throw from inside the wasm.
 */
const PD4WEB_SOUND_TOGGLE_ID = "pd4web-sound-toggle";

/** Options accepted by generated pd4web bootstrap modules. */
type Pd4WebModuleOptions = {
  wasmBinary: ArrayBuffer;
  locateFile: (path: string) => string;
};

/** Runtime shape exported as default from compiled `pd4web.js` files. */
type GeneratedPd4WebModule = (
  options: Pd4WebModuleOptions,
) => Promise<{ Pd4Web: new () => pd4web.Pd4Web }>;

/** Public React context contract consumed by UI components. */
type Pd4WebContextValue = {
  pd4web: pd4web.Pd4Web | null;
  pd4webAudioContext: AudioContext | null;
  activePatch: Map3Pd4WebPatch | null;
  status: string;
  isInitializing: boolean;
  isStopping: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  startPatch: (patchId: string) => Promise<Map3Pd4WebPatch | null>;
  stopPatch: () => Promise<void>;
};

const Pd4WebContext = createContext<Pd4WebContextValue | undefined>(undefined);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait until Pd4Web has published the audio graph of *this* patch.
 *
 * `init()` resolving does not mean the graph exists. Pd4Web assigns
 * `window.Pd4WebAudioContext` and `window.Pd4WebAudioWorkletNode` a moment
 * later — over four seconds on a cold load, with the wasm still compiling —
 * and until it does, the globals still point at the *previous* patch's
 * context, the one `stopPatch` has just closed.
 *
 * Reading them straight after `init()` therefore produced the bug behind
 * "the Mute button does nothing": the fade gain was built on a closed
 * context, where connecting it is a no-op, so the live worklet kept its own
 * direct line to its own destination and no gain sat anywhere in the audible
 * path. Measured on lluvia: both gain nodes in the page belonged to contexts
 * in state `closed`, while the context actually producing sound was
 * `running`; clicking Unmute moved a gain that nothing was listening to.
 *
 * So the wait is for a context that is new, open, and owns the worklet.
 * `previous` is whatever the global held before this patch started loading.
 */
async function waitForPdAudio(
  previous: AudioContext | null,
  timeoutMs = 10000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const audioContext = window.Pd4WebAudioContext ?? null;
    const workletNode = window.Pd4WebAudioWorkletNode ?? null;
    if (
      audioContext &&
      workletNode &&
      audioContext !== previous &&
      audioContext.state !== "closed" &&
      workletNode.context === audioContext
    ) {
      return { audioContext, workletNode };
    }
    await sleep(25);
  }

  // Last resort: Pd4Web may legitimately reuse one context for every patch,
  // in which case "new" never becomes true. Take whatever is open.
  const audioContext = window.Pd4WebAudioContext ?? null;
  return {
    audioContext:
      audioContext && audioContext.state !== "closed" ? audioContext : null,
    workletNode: window.Pd4WebAudioWorkletNode ?? null,
  };
}

/**
 * Bring a suspended context back to life.
 *
 * `startPatch` reaches `init()` only after a dynamic import, a wasm fetch and
 * an `arrayBuffer()`, by which point the user activation from the click that
 * started the patch has expired. The context then comes up `suspended` with
 * `currentTime` frozen at 0 and the patch computes nothing, while the UI
 * cheerfully reports "Running". Ask once directly, and if the autoplay policy
 * still refuses, let the visitor's next gesture do it.
 */
async function resumeAudioContext(audioContext: AudioContext) {
  // Read the state through a function on purpose. TypeScript carries its
  // narrowing of `audioContext.state` across the `await` and then calls the
  // second check a comparison with no overlap — but changing that state is
  // precisely what `resume()` does.
  const estado = () => audioContext.state;

  if (estado() === "running") return;

  try {
    await audioContext.resume();
  } catch {
    // Ignored on purpose: the gesture fallback below is the second chance.
  }
  if (estado() === "running") return;

  const eventos = ["pointerdown", "keydown", "touchstart"] as const;
  const retry = () => {
    for (const evento of eventos) {
      window.removeEventListener(evento, retry);
    }
    audioContext.resume().catch(() => undefined);
  };
  for (const evento of eventos) {
    window.addEventListener(evento, retry, { passive: true });
  }
}

export function Pd4WebProvider({ children }: PropsWithChildren) {
  const [pd4web, setPd4web] = useState<pd4web.Pd4Web | null>(null);
  const [pd4webAudioContext, setPd4webAudioContext] =
    useState<AudioContext | null>(null);
  const [activePatch, setActivePatch] = useState<Map3Pd4WebPatch | null>(null);
  const [status, setStatus] = useState("Ready.");
  const [isInitializing, setIsInitializing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  /**
   * Um patch começa audível.
   *
   * Isto já foi `true`, e durante muito tempo não significou nada: o fade gain
   * era montado no `AudioContext` anterior, já fechado, então o worklet vivo
   * mantinha linha direta para a saída e o som vazava de qualquer jeito. Com o
   * roteamento consertado o padrão passou a valer de verdade — e aí apareceu o
   * problema real: a obra abria em silêncio até alguém achar o botão Unmute,
   * enquanto as obras de `.mp3` tocam na hora, em volume 1, sem controle algum.
   *
   * Numa instalação é o avesso do que se quer, e a incoerência entre os dois
   * caminhos de áudio não tinha defesa. O Mute continua inteiro; o que mudou é
   * de que lado ele começa. Quem quiser abrir em silêncio inverte estas duas
   * linhas — e `stopPatch` lá embaixo, que restaura o mesmo padrão.
   */
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false); // ref espelhando isMuted para uso em callbacks assíncronos
  const fadeGainRef = useRef<GainNode | null>(null);
  const rewireTimersRef = useRef<number[]>([]);
  const pd4webRef = useRef<pd4web.Pd4Web | null>(null);
  const pd4webAudioContextRef = useRef<AudioContext | null>(null);
  const isInitializingRef = useRef(false);
  const isStoppingRef = useRef(false);

  /** Start a compiled patch and connect a fade gain node for smoother stops. */
  const startPatch = useCallback(async (patchId: string) => {
    if (
      pd4webRef.current ||
      isInitializingRef.current ||
      isStoppingRef.current
    ) {
      return null;
    }

    const patch = getMap3Pd4WebPatchById(patchId);
    if (!patch) {
      setStatus(`Unknown patch: ${patchId}.`);
      return null;
    }

    // Whatever the global points at right now belongs to the patch that just
    // stopped. Remember it so the wait below can tell the two apart.
    const staleAudioContext = window.Pd4WebAudioContext ?? null;

    const bundleFolder = patch.bundleFolder;

    isInitializingRef.current = true;
    setIsInitializing(true);
    setStatus(`Loading ${patch.label}...`);

    try {
      const moduleNamespace = (await import(
        /* webpackIgnore: true */
        `/${bundleFolder}/pd4web.js`
      )) as unknown as { default: GeneratedPd4WebModule };
      const Pd4WebModule = moduleNamespace.default;

      // The runtime is shared: patches built from the same externals resolve to
      // the same hashed URL, so switching patches reuses a warm browser cache
      // and only the ~0.5 MB data package is fetched again.
      const wasmUrl = getPatchRuntimeUrl(patch);
      const wasmResponse = await fetch(wasmUrl);
      if (!wasmResponse.ok) {
        throw new Error(`Could not fetch ${wasmUrl}`);
      }

      const wasmBinary = await wasmResponse.arrayBuffer();
      const pdModule = await Pd4WebModule({
        // `wasmBinary` alone is not enough. Loaders generated by Pd4Web 3.3 try
        // to stream-compile from locateFile("pd4web.wasm") first and only fall
        // back to the buffer, so without redirecting the path they 404 on the
        // bundle folder, which no longer holds a .wasm. Older loaders (still in
        // use by prebuilt patches) honour the buffer. Doing both satisfies each.
        wasmBinary,
        locateFile: (path) =>
          path === "pd4web.wasm" ? wasmUrl : `/${bundleFolder}/${path}`,
      });

      const instance = new pdModule.Pd4Web();
      instance.openPatch("index.pd", {
        //canvasId: P4DWEB_CANVAS_ID,
        renderGui: false,
        soundToggleId: PD4WEB_SOUND_TOGGLE_ID,
        // No audio input, ever.
        //
        // With any input channel Pd4Web's `JS_GetMicAccess` calls
        // `getUserMedia({audio: ...})` and chains a bare `.then()`, so a
        // visitor who refuses the microphone — or a kiosk with none — gets an
        // uncaught `NotAllowedError: Permission denied` on every patch. And
        // when the microphone *is* granted it is routed straight into the
        // patch, which is not something an installation should do behind the
        // visitor's back. The only patch here with an `adc~` is
        // paraisoGaia43, where it feeds `dca~ -> delay16~ -> mono~` and stops:
        // nothing downstream, so no sound is lost by closing the door.
        //
        // It also removes a race. On the microphone branch Pd4Web connects
        // the worklet straight to `destination` *inside the promise*, long
        // after `init()` resolves — the bypass that made the Mute button look
        // broken. With zero inputs that connection happens synchronously.
        channelCountIn: 0,
      });
      await instance.init();

      const { audioContext, workletNode } =
        await waitForPdAudio(staleAudioContext);

      if (audioContext && workletNode) {
        const fadeGain = audioContext.createGain();
        fadeGain.gain.value = isMutedRef.current ? 0 : 1;
        fadeGain.connect(audioContext.destination);
        fadeGainRef.current = fadeGain;

        // Route the patch through the gain — and keep re-asserting that route
        // for a moment.
        //
        // Pd4Web sometimes connects its worklet straight to the destination
        // *after* `init()` has resolved. When that happened the patch had two
        // ways out, one of them bypassing the gain, and Mute silenced only the
        // half that went through it. Measured on exemplo-clima: with the
        // button reading "Unmute", the level at the destination was identical
        // to the patch's raw output — the gain was at zero and inaudible all
        // the same. Re-running the routing a few times closes that window;
        // `disconnect()` is what removes the direct edge, and reconnecting to
        // the same gain node is idempotent.
        const route = () => {
          try {
            workletNode.disconnect();
            workletNode.connect(fadeGain);
          } catch {
            // The node can already be gone if the patch was stopped meanwhile.
          }
        };
        route();
        rewireTimersRef.current = [150, 600, 1500, 3000].map((ms) =>
          window.setTimeout(route, ms),
        );
      }

      // Without this the context stays suspended and nothing is ever heard,
      // however healthy the patch is.
      if (audioContext) {
        await resumeAudioContext(audioContext);
      }

      // Expose the running patch on window, matching the global already declared
      // in types/pd4web.d.ts and the usage Pd4Web itself documents.
      //
      // This is how a musician tests a patch whose data happens to be zero. A
      // thunder patch reacts to real lightning strikes, so on a calm day there
      // is nothing to hear and no way to tell "working but quiet" from "broken".
      // From the browser console, `Pd4Web.sendBang("bolt")` settles it.
      window.Pd4Web = instance;

      pd4webRef.current = instance;
      pd4webAudioContextRef.current = audioContext;
      setPd4web(instance);
      setPd4webAudioContext(audioContext);
      setActivePatch(patch);
      setStatus(`Running ${patch.label}.`);
      return patch;
    } catch (error) {
      console.error("Error while starting patch:", error);
      setStatus(`Failed to start ${patch.label}.`);
      return null;
    } finally {
      isInitializingRef.current = false;
      setIsInitializing(false);
    }
  }, []);

  /** Stop the active patch with a short linear fade and close audio resources. */
  const stopPatch = useCallback(async () => {
    if (
      !pd4webRef.current ||
      isInitializingRef.current ||
      isStoppingRef.current
    ) {
      return;
    }

    isStoppingRef.current = true;
    setIsStopping(true);
    setStatus("Stopping...");

    try {
      const audioContext =
        window.Pd4WebAudioContext ?? pd4webAudioContextRef.current;
      const fadeGain = fadeGainRef.current;

      if (fadeGain && audioContext && audioContext.state === "running") {
        const now = audioContext.currentTime;
        fadeGain.gain.cancelScheduledValues(now);
        fadeGain.gain.setValueAtTime(fadeGain.gain.value, now);
        fadeGain.gain.linearRampToValueAtTime(0, now + 0.5);
        await sleep(510);
      }

      if (audioContext && audioContext.state !== "closed") {
        await audioContext.close();
      }
    } catch (error) {
      console.error("Error while stopping patch:", error);
    } finally {
      for (const timer of rewireTimersRef.current) {
        window.clearTimeout(timer);
      }
      rewireTimersRef.current = [];
      fadeGainRef.current = null;
      window.Pd4Web = undefined;
      pd4webRef.current = null;
      pd4webAudioContextRef.current = null;
      isStoppingRef.current = false;
      setPd4web(null);
      setPd4webAudioContext(null);
      setActivePatch(null);
      setStatus("Stopped.");
      setIsStopping(false);
      // Volta ao padrão audível, para que o próximo patch não herde um mute
      // que o visitante nunca pediu.
      isMutedRef.current = false;
      setIsMuted(false);
    }
  }, []);

 const toggleMute = useCallback(() => {
   const nextMuted = !isMutedRef.current;
   isMutedRef.current = nextMuted;
   setIsMuted(nextMuted);

   const fadeGain = fadeGainRef.current;
   const audioContext = pd4webAudioContextRef.current;
   if (!fadeGain || !audioContext) return;

   // A suspended context has a frozen clock, so a scheduled ramp would never
   // run: the button used to flip its own label while the gain stayed put.
   // Set the value outright, and take this click as the gesture the autoplay
   // policy was waiting for.
   if (audioContext.state !== "running") {
     fadeGain.gain.value = nextMuted ? 0 : 1;
     void resumeAudioContext(audioContext);
     return;
   }

   const now = audioContext.currentTime;
   fadeGain.gain.cancelScheduledValues(now);
   fadeGain.gain.setValueAtTime(fadeGain.gain.value, now);
   fadeGain.gain.linearRampToValueAtTime(nextMuted ? 0 : 1, now + 0.15);
 }, []);

  const value = useMemo<Pd4WebContextValue>(
    () => ({
      pd4web,
      pd4webAudioContext,
      activePatch,
      status,
      isInitializing,
      isStopping,
      startPatch,
      stopPatch,
      isMuted,
      toggleMute,
    }),
    [
      pd4web,
      pd4webAudioContext,
      activePatch,
      status,
      isInitializing,
      isStopping,
      startPatch,
      stopPatch,
      isMuted,
      toggleMute,
    ],
  );

  return (
    <Pd4WebContext.Provider value={value}>
      {children}
      {/* Pd4Web's own toggle target. It is never shown and never clicked —
          `startPatch` calls `init()` directly — but it has to exist before
          `openPatch` runs, so it lives here, mounted for the whole session. */}
      <span
        id={PD4WEB_SOUND_TOGGLE_ID}
        aria-hidden="true"
        style={{
          position: "fixed",
          left: -9999,
          top: -9999,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </Pd4WebContext.Provider>
  );
}

/** Consumer hook for pd4web state/actions. Must be used inside `Pd4WebProvider`. */
export function usePd4Web() {
  const context = useContext(Pd4WebContext);
  if (!context) {
    throw new Error("usePd4Web must be used inside Pd4WebProvider");
  }

  return context;
}
