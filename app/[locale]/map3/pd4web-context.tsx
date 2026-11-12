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
  activePatch: Map3Pd4WebPatch | null;
  /**
   * Patch ainda inicializando (fetch do wasm + worklet). Quem decide parar ou
   * trocar o áudio ao fechar uma obra precisa enxergar este estado: durante a
   * janela de carga `activePatch` ainda é null, e decidir só por ele deixava o
   * patch nascer órfão quando a obra era fechada cedo.
   */
  loadingPatch: Map3Pd4WebPatch | null;
  status: string;
  isInitializing: boolean;
  isStopping: boolean;
  isMuted: boolean;
  isAudioStarted: boolean;
  /**
   * Toggle audio on/off. MUST be called synchronously from inside a real
   * click handler — no `await` before it — because it calls pd4web's own
   * `toggleAudio()`, which the browser only allows to start/resume audio in
   * direct response to a user gesture. See
   * https://charlesneimog.github.io/pd4web/javascript/02-audio-initialization/
   */
  toggleMute: () => void;
  /**
   * Load (but do not play) a patch: dynamic import, wasm fetch, module
   * instantiation, `openPatch()`. Deliberately never calls `init()` or
   * `toggleAudio()`, so this is safe to call from anywhere — including
   * automatically, with no user gesture — and never produces sound by
   * itself. Audio only ever starts via `toggleMute()`.
   */
  startPatch: (patchId: string) => Promise<Map3Pd4WebPatch | null>;
  stopPatch: () => Promise<void>;
};

const Pd4WebContext = createContext<Pd4WebContextValue | undefined>(undefined);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait until pd4web has published the AudioContext of *this* patch.
 *
 * `toggleAudio()` returning does not mean the graph exists: pd4web assigns
 * `window.Pd4WebAudioContext` a moment later — several seconds on a cold load,
 * with the wasm still compiling — and until then the global still points at the
 * previous patch's context, the one `stopPatch` has just closed. `anterior` is
 * whatever the global held before this patch started loading.
 */
async function esperarContexto(
  anterior: AudioContext | null,
  timeoutMs = 10000,
): Promise<AudioContext | null> {
  const prazo = Date.now() + timeoutMs;
  while (Date.now() < prazo) {
    const ctx = window.Pd4WebAudioContext ?? null;
    if (ctx && ctx !== anterior && ctx.state !== "closed") return ctx;
    await sleep(25);
  }
  const ctx = window.Pd4WebAudioContext ?? null;
  return ctx && ctx.state !== "closed" ? ctx : null;
}

/**
 * Start the audio of a patch that has just finished loading, without asking
 * the visitor to click anything.
 *
 * The work is opened by a click, so the page already has user activation when
 * this runs — but the load crosses a dynamic import, a wasm fetch and an
 * `arrayBuffer()`, and Chrome's *transient* activation does not survive that.
 * Sticky activation usually does, which is why calling `toggleAudio()` here
 * works in practice; where the autoplay policy refuses, the context comes up
 * `suspended` with its clock frozen at 0 and the patch computes nothing while
 * the UI cheerfully says it is playing.
 *
 * So: ask, check, and if the browser said no, hand the job to the visitor's
 * next gesture instead of pretending. That fallback is also the answer to the
 * objection in pd4web's docs (and in the comment `startPatch` used to carry)
 * that only a real click may start audio: when that is true here, the next
 * click starts it, and nothing is lost in the meantime but silence.
 */
async function iniciarAudioSozinho(
  instance: pd4web.Pd4Web,
  anterior: AudioContext | null,
): Promise<boolean> {
  try {
    instance.toggleAudio();
  } catch (error) {
    console.warn("pd4web: toggleAudio() falhou ao iniciar o patch", error);
    return false;
  }

  const ctx = await esperarContexto(anterior);
  if (!ctx) return false;
  // Lido por uma função de propósito: o TypeScript carrega o estreitamento de
  // `ctx.state` por cima do await, e mudar esse estado é exatamente o que o
  // resume() faz.
  const estado = () => ctx.state;
  if (estado() === "running") return true;

  try {
    await ctx.resume();
  } catch {
    // Ignorado: o gesto abaixo é a segunda chance.
  }
  if (estado() === "running") return true;

  const eventos = ["pointerdown", "keydown", "touchstart"] as const;
  const retomar = () => {
    for (const evento of eventos) window.removeEventListener(evento, retomar);
    ctx.resume().catch(() => undefined);
  };
  for (const evento of eventos) {
    window.addEventListener(evento, retomar, { passive: true });
  }
  return false;
}

export function Pd4WebProvider({ children }: PropsWithChildren) {
  const [pd4web, setPd4web] = useState<pd4web.Pd4Web | null>(null);
  const [activePatch, setActivePatch] = useState<Map3Pd4WebPatch | null>(null);
  const [loadingPatch, setLoadingPatch] = useState<Map3Pd4WebPatch | null>(
    null,
  );
  const [status, setStatus] = useState("Ready.");
  const [isInitializing, setIsInitializing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  /**
   * A obra abre tocando.
   *
   * Isto já foi `true`: o patch nascia mudo e o áudio só começava quando
   * alguém achasse o botão Unmute — enquanto as obras de `.mp3` tocavam na
   * hora, em volume 1, sem controle algum. Numa instalação é o avesso do que
   * se quer, e a incoerência entre os dois caminhos de áudio não tinha defesa.
   * O Mute continua inteiro; o que mudou é de que lado ele começa.
   */
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioStarted, setIsAudioStarted] = useState(false);
  const isMutedRef = useRef(false); // ref espelhando isMuted para uso em callbacks assíncronos
  const pd4webRef = useRef<pd4web.Pd4Web | null>(null);
  const isInitializingRef = useRef(false);
  const isStoppingRef = useRef(false);
  // Um stopPatch() chamado no meio da inicialização não tem o que derrubar
  // ainda: registra o pedido aqui e o próprio startPatch desfaz tudo ao
  // concluir, em vez de deixar o patch nascer tocando sem ninguém no comando.
  const stopRequestedRef = useRef(false);

  /**
   * Load a compiled patch. This is purely asset-loading + `openPatch()` —
   * it never starts the audio engine, so it is safe to call eagerly (e.g.
   * from a `useEffect`) with no click involved. Playback only ever begins
   * inside `toggleMute()`, which is what pd4web's autoplay-gesture rule
   * actually requires.
   */
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
    setLoadingPatch(patch);
    setStatus(`Loading ${patch.label}...`);

    // O init() de cada patch cria um AudioContext próprio e o publica em
    // window um instante DEPOIS de resolver. Guardar o anterior permite ao
    // desmonte precoce distinguir o contexto novo do velho já fechado.
    const previousAudioContext = window.Pd4WebAudioContext ?? null;

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

      // Deliberately no `soundToggleId` — we drive audio ourselves through
      // toggleMute()/toggleAudio(), from our own React button(s), rather than
      // handing pd4web a raw DOM id to attach its own listener to.
      instance.openPatch("index.pd", {
        //canvasId: P4DWEB_CANVAS_ID,
        renderGui: false,
        // No audio input, ever.
        //
        // With any input channel Pd4Web's `JS_GetMicAccess` calls
        // `getUserMedia({audio: ...})` and chains a bare `.then()`, so a
        // visitor who refuses the microphone — or a kiosk with none — gets an
        // uncaught `NotAllowedError: Permission denied` on the first unmute.
        // And when the microphone *is* granted it is routed straight into the
        // patch, which is not something an installation should do behind the
        // visitor's back.
        //
        // Nothing is lost by closing the door: the only patch here with an
        // `adc~` is paraisoGaia43, where it feeds `dca~ -> delay16~ -> mono~`
        // and stops — the branch has no outgoing connection.
        channelCountIn: 0,
      });

      // Começa a tocar sozinho. `init()` continua fora daqui de propósito —
      // era ele, chamado às cegas no meio dos awaits, que deixava o contexto
      // nascer suspenso com o relógio em 0 e a UI dizendo "tocando". Quem
      // inicia é o `toggleAudio()` do pd4web, e o resultado é conferido:
      // ver `iniciarAudioSozinho`.

      // Expose the running patch on window, matching the global already declared
      // in types/pd4web.d.ts and the usage Pd4Web itself documents.
      //
      // This is how a musician tests a patch whose data happens to be zero. A
      // thunder patch reacts to real lightning strikes, so on a calm day there
      // is nothing to hear and no way to tell "working but quiet" from "broken".
      // From the browser console, `Pd4Web.sendBang("bolt")` settles it.
      window.Pd4Web = instance;

      pd4webRef.current = instance;
      setPd4web(instance);
      setActivePatch(patch);

      const tocando = await iniciarAudioSozinho(instance, previousAudioContext);
      // O botão espelha o que o navegador realmente concedeu: se o áudio não
      // começou, ele nasce em "Unmute" e o próximo clique resolve as duas
      // coisas de uma vez (retoma o contexto e acerta o rótulo).
      isMutedRef.current = !tocando;
      setIsMuted(!tocando);
      setIsAudioStarted(tocando);
      setStatus(
        tocando
          ? `Running ${patch.label}.`
          : `Loaded ${patch.label} (esperando um clique para soar).`,
      );
      return patch;
    } catch (error) {
      console.error("Error while starting patch:", error);
      setStatus(`Failed to start ${patch.label}.`);
      return null;
    } finally {
      isInitializingRef.current = false;
      setIsInitializing(false);
      setLoadingPatch(null);
      // Se a carga falhou, um pedido pendente já está satisfeito: nada toca.
      stopRequestedRef.current = false;
    }
  }, []);

  /** Stop the active patch and release its audio resources. */
  const stopPatch = useCallback(async () => {
    // Pedido no meio da inicialização: ainda não há o que derrubar, então o
    // registro fica para o startPatch consumir ao concluir. Antes este caso
    // retornava em silêncio, e fechar a obra cedo deixava o patch tocando
    // órfão depois que o wasm terminava de carregar.
    if (isInitializingRef.current) {
      stopRequestedRef.current = true;
      setStatus("Stopping...");
      return;
    }

    if (!pd4webRef.current || isStoppingRef.current) {
      return;
    }

    isStoppingRef.current = true;
    setIsStopping(true);
    setStatus("Stopping...");

    try {
      // If audio is currently playing, pause it before tearing down. This is
      // always allowed without a fresh user gesture — suspending a running
      // context never needs one, only resuming/starting one does — so it's
      // safe to call here even though stopPatch isn't always invoked from a
      // click (e.g. it may run from a composition-change effect).
      if (!isMutedRef.current) {
        try {
          pd4webRef.current.toggleAudio();
        } catch (error) {
          console.warn("pd4web: toggleAudio() failed while stopping", error);
        }
      }

      const audioContext = window.Pd4WebAudioContext ?? null;
      if (audioContext && audioContext.state !== "closed") {
        await audioContext.close();
      }
    } catch (error) {
      console.error("Error while stopping patch:", error);
    } finally {
      window.Pd4Web = undefined;
      pd4webRef.current = null;
      isStoppingRef.current = false;
      setPd4web(null);
      setActivePatch(null);
      setStatus("Stopped.");
      setIsStopping(false);
      // Volta ao padrão audível, para que o próximo patch não herde um mute
      // que o visitante nunca pediu.
      isMutedRef.current = false;
      setIsMuted(false);
      setIsAudioStarted(false);
    }
  }, []);

  /**
   * Toggle audio on/off via pd4web's own `toggleAudio()`.
   *
   * CALLERS MUST invoke this directly inside a synchronous click handler —
   * no `await`, no `.then()` hop, nothing between the user's click and this
   * call — because the very first invocation on a given patch instance is
   * what actually starts its AudioContext, and browsers only allow that in
   * direct response to a user gesture. See
   * https://charlesneimog.github.io/pd4web/javascript/02-audio-initialization/
   */
  const toggleMute = useCallback(() => {
    const instance = pd4webRef.current;
    if (!instance) {
      // Nothing loaded yet — the UI should disable the control in this case
      // (see isBusy / !pd4web checks in the consuming components) rather
      // than reach this branch, but bail safely if it does.
      return;
    }

    instance.toggleAudio();

    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    // Este clique é um gesto de verdade: se o áudio nunca tinha começado
    // (política de autoplay), é agora que ele começa.
    if (!nextMuted) setIsAudioStarted(true);

    // Um contexto que ficou suspenso tem o relógio parado, então o
    // toggleAudio() acima pode ter trocado o rótulo sem religar nada.
    const ctx = window.Pd4WebAudioContext ?? null;
    if (!nextMuted && ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => undefined);
    }
  }, []);

  const value = useMemo<Pd4WebContextValue>(
    () => ({
      pd4web,
      activePatch,
      loadingPatch,
      status,
      isInitializing,
      isStopping,
      startPatch,
      stopPatch,
      isMuted,
      isAudioStarted,
      toggleMute,
    }),
    [
      pd4web,
      activePatch,
      loadingPatch,
      status,
      isInitializing,
      isStopping,
      startPatch,
      stopPatch,
      isMuted,
      isAudioStarted,
      toggleMute,
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
