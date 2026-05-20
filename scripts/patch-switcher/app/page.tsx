"use client";

import { Pd4WebProvider, usePd4Web } from "@/app/pd4web-context";
import LluviaSketch from "@/app/lluvia-sketch";

function PatchControls() {
  const {
    activePatch,
    isInitializing,
    isStopping,
    status,
    startPatch,
    stopPatch,
  } = usePd4Web();

  const isBusy = isInitializing || isStopping;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Pd Patch Switcher</h1>

      <div className="grid w-full gap-3">
        <button
          type="button"
          className="rounded-md bg-blue-600 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy || activePatch !== null}
          onClick={() => startPatch("bubble1")}
        >
          Start Bubble1 Patch
        </button>

        <button
          type="button"
          className="rounded-md bg-sky-700 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy || activePatch !== null}
          onClick={() => startPatch("wind4")}
        >
          Start Wind4 Patch
        </button>

        <button
          type="button"
          className="rounded-md bg-rose-600 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy || activePatch === null}
          onClick={stopPatch}
        >
          Stop Patch
        </button>
      </div>

      {activePatch === "bubble1" && !isInitializing && !isStopping ? (
        <LluviaSketch play />
      ) : (
        <div className="flex h-[320px] w-full items-center justify-center rounded-xl border border-white/10 bg-white/60 px-6 text-center text-sm text-zinc-500 shadow-lg backdrop-blur dark:bg-black/20 dark:text-zinc-400">
          The lluvia sketch appears after Bubble1 finishes starting.
        </div>
      )}

      <p className="text-sm text-zinc-600 dark:text-zinc-300">{status}</p>
    </main>
  );
}

export default function Home() {
  return (
    <Pd4WebProvider>
      <PatchControls />
    </Pd4WebProvider>
  );
}
