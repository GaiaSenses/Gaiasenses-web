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
import { getMap3Pd4WebPatchById, type Map3Pd4WebPatch } from "./pd4web-patches";

const P4DWEB_CANVAS_ID = "pd4web-canvas";

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
  startPatch: (patchId: string) => Promise<Map3Pd4WebPatch | null>;
  stopPatch: () => Promise<void>;
};

const Pd4WebContext = createContext<Pd4WebContextValue | undefined>(undefined);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function Pd4WebProvider({ children }: PropsWithChildren) {
  const [pd4web, setPd4web] = useState<pd4web.Pd4Web | null>(null);
  const [pd4webAudioContext, setPd4webAudioContext] =
    useState<AudioContext | null>(null);
  const [activePatch, setActivePatch] = useState<Map3Pd4WebPatch | null>(null);
  const [status, setStatus] = useState("Ready.");
  const [isInitializing, setIsInitializing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const fadeGainRef = useRef<GainNode | null>(null);
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

      const wasmResponse = await fetch(`/${bundleFolder}/pd4web.wasm`);
      if (!wasmResponse.ok) {
        throw new Error(`Could not fetch /${bundleFolder}/pd4web.wasm`);
      }

      const wasmBinary = await wasmResponse.arrayBuffer();
      const pdModule = await Pd4WebModule({
        wasmBinary,
        locateFile: (path) => `/${bundleFolder}/${path}`,
      });

      const instance = new pdModule.Pd4Web();
      instance.openPatch("index.pd", {
        canvasId: P4DWEB_CANVAS_ID,
        renderGui: false,
      });
      await instance.init();
      // await window.Pd4WebAudioContext?.resume();
      instance.sendBang("start");
      const audioContext = window.Pd4WebAudioContext ?? null;
      const workletNode = window.Pd4WebAudioWorkletNode ?? null;

      if (audioContext && workletNode) {
        const fadeGain = audioContext.createGain();
        fadeGain.gain.value = 1;
        workletNode.disconnect();
        workletNode.connect(fadeGain);
        fadeGain.connect(audioContext.destination);
        fadeGainRef.current = fadeGain;
      }

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
      fadeGainRef.current = null;
      pd4webRef.current = null;
      pd4webAudioContextRef.current = null;
      isStoppingRef.current = false;
      setPd4web(null);
      setPd4webAudioContext(null);
      setActivePatch(null);
      setStatus("Stopped.");
      setIsStopping(false);
    }
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
    ],
  );

  return (
    <Pd4WebContext.Provider value={value}>{children}</Pd4WebContext.Provider>
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
