# Pd4Web Patch Switching Architecture

This document describes the implementation used in this app to load, start, stop, and switch between compiled Pd4Web patches from React. It is written as a reusable blueprint for porting the same pattern into a more complex application.

## What This Architecture Solves

The goal is to treat each compiled Pd patch as a runtime feature that can be started and stopped from React UI, while keeping the UI in control of:

1. which patch is active,
2. whether the Pd runtime is still initializing or stopping,
3. the current `pd4web` instance,
4. the current `AudioContext`, and
5. any patch-specific UI that should only appear after a patch is running.

The implementation is intentionally small and explicit so it can survive being moved into a larger app without hiding lifecycle behavior behind a lot of abstraction.

## Core Files

- [app/pd4web-context.tsx](../app/pd4web-context.tsx)
- [app/layout.tsx](../app/layout.tsx)
- [app/page.tsx](../app/page.tsx)

The compiled patch artifacts live under `public/` so they can be fetched at runtime by patch name.

## High-Level Model

The design is a React context provider that owns the Pd runtime lifecycle.

The provider exposes:

- `pd4web`: the active compiled Pd4Web instance, or `null` when stopped.
- `pd4webAudioContext`: the active audio context, or `null` when stopped.
- `activePatch`: the currently running patch name, or `null`.
- `status`: human-readable status text for the UI.
- `isInitializing`: whether a patch is currently booting.
- `isStopping`: whether the active patch is shutting down.
- `startPatch(patch)`: loads and starts a compiled patch.
- `stopPatch()`: fades out and shuts down the active patch.

Any component that needs Pd runtime access uses `usePd4Web()` and never reaches into the loader directly.

## Patch Loading Flow

Starting a patch follows the same sequence every time:

1. Guard against concurrent operations.
2. Dynamically import the generated `pd4web.js` bundle for the chosen patch.
3. Fetch the matching `pd4web.wasm` file.
4. Instantiate the generated Pd module with the fetched WASM bytes.
5. Create a `Pd4Web` instance.
6. Open the patch file, usually `index.pd`.
7. Initialize the instance.
8. Capture the audio globals from `window`.
9. Store the runtime objects in React state.
10. Mark the patch as active.

This keeps the provider as the single source of truth for patch lifecycle state.

### Why the bundle is loaded with dynamic import

The generated patch bundles are runtime artifacts, not imported at build time. The provider uses a dynamic import from `/public` so each patch can be addressed by folder name at runtime.

This is the key behavior that makes patch switching declarative: the patch name maps to a folder that contains the compiled runtime files.

### Why the WASM file is fetched manually

The generated module expects WASM bytes during boot. Fetching the file explicitly gives the provider full control over loading state and error handling before the Pd instance is created.

## Audio Bootstrapping

The app injects Pd audio globals before React starts rendering. This happens in [app/layout.tsx](../app/layout.tsx).

The runtime expects browser globals named:

- `Pd4WebAudioContext`
- `Pd4WebAudioWorkletNode`

Those are initialized in a small `beforeInteractive` script so the generated Pd bundle can reference them consistently.

After patch startup, the provider reads the runtime-created audio context from `window` and stores it in React state so the rest of the app can inspect it or shut it down later.

## Stopping a Patch

Stopping is also explicit:

1. Guard against concurrent operations.
2. Resolve the active audio context.
3. Fade the gain node down over a short interval.
4. Close the audio context.
5. Clear provider state.

The fade is there to avoid abrupt audio cutoff when switching or stopping.

The provider keeps a gain node reference in a `useRef` so the stop path can access the same node without forcing extra renders.

## Why React Context Is the Right Boundary

React context is used because it gives the app one stable runtime owner for the patch engine.

This avoids:

- passing patch state through many props,
- duplicating patch startup logic across components,
- starting the same patch from multiple places,
- losing track of the current audio context.

For a larger app, this boundary matters even more because patch switching becomes infrastructure, not page-local behavior.

## UI Integration Pattern

The page uses the provider like this:

1. A top-level provider wraps the screen.
2. Controls call `startPatch()` and `stopPatch()`.
3. The current patch name controls which sketch or patch-specific view is visible.
4. The UI can disable buttons while the runtime is initializing or stopping.

This keeps the UI declarative even though the runtime itself is imperative.

## Patch-Specific UI

Patch-specific UI should not boot the runtime directly. Instead, it should observe the context state.

For example:

- show the lluvia sketch only when `activePatch === "bubble1"`,
- avoid mounting patch-specific children while the patch is still initializing,
- pass the current `pd4web` instance down to sketch components when they need to subscribe to bang events.

This is the pattern to copy into a bigger app: the provider owns the engine, and feature components only react to its state.

## Important Constraints

There are a few rules that keep this approach stable:

1. Do not call `sendBang("start")` during render. Use `useEffect` or a similar post-render side effect.
2. Do not attach Pd bang listeners inside render paths.
3. Keep one provider instance above the feature tree that needs Pd state.
4. Treat patch startup as asynchronous and guard against repeated clicks.
5. Keep compiled patch assets in predictable public folders.
6. If a patch needs a canvas ID, make it explicit and stable.

These rules matter more in React strict mode because mount and effect behavior can happen more than once during development.

## How To Extend To More Patches

At the moment, the provider uses a small `PatchName` union, which is enough for two patches. For a larger app, the same structure can be extended into a declarative registry.

The registry should describe each patch with:

- an identifier,
- the folder name under `public/`,
- the entry patch file,
- the UI label,
- any patch-specific metadata,
- optional runtime hints like canvas ID or sketch behavior.

That lets UI code work from patch metadata instead of hard-coded conditionals.

## Reuse Blueprint For Another App

If you want to reimplement this in a more complicated app, copy the following shape:

1. Build a `Pd4WebProvider` that owns loading, startup, stop, and current runtime state.
2. Store compiled patch assets in public folders named after patch IDs.
3. Load patch bundles dynamically from the folder that matches the selected patch.
4. Fetch the patch WASM and create the generated module at runtime.
5. Capture Pd audio globals from `window` and expose them in context.
6. Expose a small typed hook like `usePd4Web()` for consumers.
7. Keep feature UI declarative and let it read context state instead of controlling the runtime directly.
8. Use `useEffect` for any side effects that touch the Pd instance.

## Why This Works Well In Practice

This pattern keeps the complicated part in one place.

The provider owns the lifecycle. The page owns the controls. Feature components only respond to state. That separation is what makes the implementation portable to a larger app.

## Short Implementation Summary

The implementation is a React context around a runtime loader. It uses dynamic import plus manual WASM fetch to start generated Pd4Web patches from `public/`, stores the active `Pd4Web` and `AudioContext` in context, and exposes a small start/stop API for the UI. Patch-specific components subscribe to that context instead of managing the engine themselves.
