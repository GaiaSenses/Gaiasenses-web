This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

test

## Installing

Install dependencies:

```bash
npm install
# or
pnpm install
```

Then, create the enviornmental variables for OpenWeather API and MapBox API.
On your root folder, create the file `.env.local`:

```
OPEN_WEATHER_API_KEY= open weather API key
NEXT_PUBLIC_MAPBOX_API_ACCESS_TOKEN= MapBox API public access token
```

## Getting Started


First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## Pd4Web in map3

`map3` now has a reusable Pd4Web structure so patches are added by configuration instead of by creating another hardcoded player component.

### Current structure

- Patch registry: [app/[locale]/map3/pd4web-patches.ts](app/[locale]/map3/pd4web-patches.ts)
- Route manager: [app/[locale]/map3/pd4web-map-audio-manager.tsx](app/[locale]/map3/pd4web-map-audio-manager.tsx)
- Reusable player/controller: [app/[locale]/map3/pd4web-map-audio.tsx](app/[locale]/map3/pd4web-map-audio.tsx)

The route manager decides which patch is active for the current map3 moment. The player/controller loads the bundle, initializes Pd4Web on first user gesture, handles play/pause, and applies the patch binding. The first binding type is `map-center`, which feeds live `mapRef.current.getCenter().wrap()` coordinates into a patch.

Each patch now lives entirely inside `public/<patch-name>/`. The map3 loader forces Pd4Web runtime files to resolve from that bundle folder, so localized routes do not require mirrored `public/en` or `public/pt` copies.

### Add a compiled Pure Data patch to Gaiasenses-web

Use this flow when you already have a Pure Data patch compiled with Pd4Web and want to make it available inside `map3`.

#### 1. Put the compiled bundle in `public`

Take the full generated `WebPatch` output from Pd4Web and copy it into a dedicated folder inside `public`.

Example:

```text
public/
  my-rain-patch/
    pd4web.js
    pd4web.data
    pd4web.wasm
    pd4web.aw.js
    pd4web.ww.js
    pd4web.gui.js
    pd4web.style.css
    pd4web.midi.js
    pd4web.threads.js
    index.pd
```

The important rule is: copy the whole generated bundle, not only `pd4web.data`.

#### 2. Normalize the generated runtime if needed

Some Pd4Web builds hardcode the audio worklet path instead of resolving it through the patch folder. Run this after copying a new bundle:

```bash
npm run normalize:pd4web -- public/my-rain-patch
```

That rewrites known `pd4web.aw.js` path issues so the patch works correctly under localized routes such as `/en/map3` and `/pt/map3`.

#### 3. Register the patch in map3

Open [app/[locale]/map3/pd4web-patches.ts](app/[locale]/map3/pd4web-patches.ts) and add a new entry to `MAP3_PD4WEB_PATCHES`.

Example:

```ts
{
	id: "my-rain-patch",
	label: "Rain texture",
	bundleFolder: "my-rain-patch",
	activation: {
		moments: ["map"],
		compositions: ["nightRain"],
	},
	binding: {
		type: "map-center",
		longitudeReceiver: "x1",
		latitudeReceiver: "y1",
		pollMs: 100,
		epsilon: 0.0001,
	},
}
```

What each field means:

- `id`: internal identifier for the patch
- `label`: UI label shown by the player
- `bundleFolder`: folder name inside `public`
- `activation.moments`: where the patch is allowed to run, currently `"map"` or `"player"`
- `activation.compositions`: optional composition filter
- `binding`: how Gaiasenses-web sends data into the Pure Data patch

#### 4. Match the binding to your Pure Data receivers

The current map3 integration supports the `map-center` binding. It reads the live map center and sends:

- longitude to `longitudeReceiver`
- latitude to `latitudeReceiver`

So your `.pd` patch must expose matching receivers. If your patch expects `x1` and `y1`, use those names in the registry entry. If it expects different receiver names, change the registry entry to match the patch.

#### 5. Choose when the patch should run

You can control patch activation in two ways:

- by `moment`
- by `composition`

Examples:

- `moments: ["map"]`: active during normal map mode
- `moments: ["player"]`: active during player mode
- `compositions: ["nightRain"]`: only active for a specific composition

The current map3 system resolves one active Pd4Web patch at a time.

#### 6. Validate the integration

After registering the patch, verify all of the following:

1. The route loads in both `/en/map3` and `/pt/map3`.
2. The `Play` button initializes the patch.
3. `Pause` and resume still work.
4. The expected Pure Data receivers actually respond to longitude and latitude.
5. The browser does not request assets from `/en/...` or `/pt/...`; it should load them from `/<patch-folder>/...`.

#### 7. If the patch needs a different input source

If a future patch should use something other than map center, extend the binding system instead of hardcoding the patch logic.

That means:

1. Add a new binding type in [app/[locale]/map3/pd4web-patches.ts](app/[locale]/map3/pd4web-patches.ts).
2. Implement the sender logic in [app/[locale]/map3/pd4web-map-audio.tsx](app/[locale]/map3/pd4web-map-audio.tsx).

Keep the patch registry declarative and keep patch-specific runtime logic out of the map container.

### How to add a new patch

1. Compile the patch with the Pd4Web CLI.
2. Copy the generated `WebPatch` output into its own folder under `public`, for example `public/my-patch/`.
3. Make sure the folder contains the generated runtime files. The patch folder should contain the full generated bundle, not only `pd4web.data`. At minimum, expect:

```text
pd4web.js
pd4web.data
pd4web.gui.js
pd4web.midi.js
pd4web.style.css
```

Some patches also require:

```text
pd4web.wasm
pd4web.aw.js
pd4web.ww.js
pd4web.threads.js
index.pd
```

4. Run `npm run normalize:pd4web -- public/my-patch` if the generated bundle hardcodes the audio worklet path.
5. Add a registry entry in [app/[locale]/map3/pd4web-patches.ts](app/[locale]/map3/pd4web-patches.ts).
6. Set the activation rule for when the patch should be active in map3.
7. Set the binding rule for how the patch receives data.

Example registry entry:

```ts
{
	id: "my-patch",
	label: "Rain texture",
	bundleFolder: "my-patch",
	activation: {
		moments: ["map"],
		compositions: ["nightRain"],
	},
	binding: {
		type: "map-center",
		longitudeReceiver: "x1",
		latitudeReceiver: "y1",
	},
}
```

### How activation works

- `moments: ["map"]`: patch is available while map3 is in normal map mode
- `moments: ["player"]`: patch is available while map3 is in player mode
- `compositions`: optional extra filter if a patch should only run for specific compositions

The current setup keeps one active Pd4Web patch at a time in `map3`.

### How bindings work

The first supported binding is `map-center`:

- reads the live center of the map from `mapRef`
- sends longitude and latitude to the Pd receivers you configure
- follows BLE-smoothed movement automatically because it consumes the map result, not the sensor pipeline directly

If you need a different type of input later, add a new binding type to [app/[locale]/map3/pd4web-patches.ts](app/[locale]/map3/pd4web-patches.ts) and implement the sender logic in [app/[locale]/map3/pd4web-map-audio.tsx](app/[locale]/map3/pd4web-map-audio.tsx).

### Maintenance notes

The map3 loader now passes a bundle-scoped `locateFile(...)` so `pd4web.data`, `pd4web.wasm`, workers, and related runtime files resolve from the active patch folder instead of from the current route.

The remaining generated-runtime edge case is the audio worklet path. Some Pd4Web bundles hardcode `pd4web.aw.js` or `/pd4web/pd4web.aw.js` instead of routing that request through `locateFile(...)`. Run `npm run normalize:pd4web -- public/<patch-folder>` after copying a new bundle to normalize that case.

### Recommended workflow for a new patch

1. Compile with Pd4Web.
2. Copy the bundle into `public/<patch-folder>/`.
3. Run `npm run normalize:pd4web -- public/<patch-folder>`.
4. Register it in [app/[locale]/map3/pd4web-patches.ts](app/[locale]/map3/pd4web-patches.ts).
5. Verify `Play` works in `/en/map3` and `/pt/map3`.
6. Verify the expected receivers are actually present in the `.pd` patch.
