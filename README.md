# GaiaSenses Web - Teammate Handoff Guide

This document is a direct maintenance guide for the next developer.
It explains where each core behavior lives, how BLE sensor input is handled, how Pd4Web patches are integrated, and how to add new visual compositions.

## 1) What This Project Is

GaiaSenses Web is a Next.js app with a map-first experience in map3:

- Map mode: interactive globe + weather data + BLE sensor input + map audio patch.
- Player mode: fullscreen visual composition selected from a composition catalog.
- Pd4Web is used for audio patches compiled from Pure Data and loaded from public folders.

Main route:

- app/[locale]/map3/page.tsx

## 2) Quick Start

Install and run:

```bash
npm install
npm run dev
```

Required env vars in .env.local:

```env
OPEN_WEATHER_API_KEY=your_api_key
NEXT_PUBLIC_MAPBOX_API_ACCESS_TOKEN=

NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

MONGODB_URI=


NEXT_PUBLIC_SUPABASE_URL=

NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=
```

Useful scripts:

- npm run dev
- npm run build
- npm run lint
- npm run sensor:ws

## 3) Project Structure You Will Touch Most

### Map3 core

- app/[locale]/map3/page.tsx
  - Server route entry. Loads weather/fire/lightning data, resolves composition, renders map + player modal.
- app/[locale]/map3/gaiasenses-map.tsx
  - Main runtime orchestrator in the browser (map events, BLE callbacks, Pd4Web data forwarding, patch log, motion panel).
- app/[locale]/map3/use-map-interactions.ts
  - Map pointer/geolocate/input mode handling.

### Sensor pipeline

- app/[locale]/map3/ble-control.tsx
  - Web Bluetooth connection UI and packet parsing from device characteristics.
- app/[locale]/map3/use-ble-sensor.ts
  - Connects BLE packets to smoothing logic, composition side effects, and calibration lifecycle.
- app/[locale]/map3/use-sensor-smoothing.ts
  - Core math and smoothing engine. Supports mapping methods: pd, euler, quaternion, basic.

### Pd4Web audio pipeline

- app/[locale]/map3/pd4web-context.tsx
  - Starts/stops compiled patches, loads /<bundleFolder>/pd4web.js, fetches wasm, owns active patch state.
- app/[locale]/map3/pd4web-patches.ts
  - Central patch registry and binding metadata.
- app/[locale]/map3/pd4web-patch-log.tsx
  - Runtime log panel for patch I/O debugging.

### Composition catalog

- components/compositions/compositions-info.tsx
  - Source of truth for compositions, their components, optional patchId, and keepMapPatch behavior.
- app/[locale]/map3/composition-dropdown.tsx
  - Composition selection flow and patch switching when entering player mode.
- components/compositions/toggle-play-button.tsx
  - Return from player to map and restoration/stopping of patches.
- app/[locale]/map3/use-composition-queue.ts
  - Climate-based composition recommendation logic.

### Static assets

- public/
  - Compiled Pd4Web bundles (one folder per patch).
  - Compoled Pd4Web shared threads logic on public/pd4webShared/pd4web.threads.js. Should only be changed if pd4web lounches a new version.
  - Composition static assets if needed.

## 4) How Sensor Handling Works End-to-End

### 4.1 BLE connection and incoming packets

File: app/[locale]/map3/ble-control.tsx

- Connects to BLE service/characteristics.
- Parses JSON payloads from notifications.
- Calls:
  - onSensor(data) for orientation/acceleration packets.
  - onCo2Sensor(data) for CO2 packets.
  - onConnect("controller") and onDisconnect("mouse") to update input mode.

### 4.2 Sensor orchestration

File: app/[locale]/map3/use-ble-sensor.ts

- Receives packets from BLEControl and passes sensor packets to use-sensor-smoothing.
- Resets calibration on connect/disconnect.
- Handles composition side effects for CO2 threshold logic.

### 4.3 Smoothing and map motion

File: app/[locale]/map3/use-sensor-smoothing.ts

- Maintains baseline calibration.
- Computes relative angles/quaternion projection.
- Applies median + EMA smoothing.
- Updates map movement via requestAnimationFrame loop.

Mapping methods:

- pd: map movement is driven by pdMapTargetRef values produced by Pure Data output list (The pd patch running on the Map calculates the resulting latitude and longitude based on acelerometer data).
- euler/quaternion/basic: map movement is computed locally from sensor math.

Important PD safety behavior:

- In gaiasenses-map.tsx, PD output list updates map target only when sensor is connected (input mode not mouse).

## 5) How Pd4Web Integration Works

## 5.1 Runtime loading

File: app/[locale]/map3/pd4web-context.tsx

When startPatch(patchId) is called:

1. Looks up patch metadata in pd4web-patches.ts.
2. Dynamically imports /<bundleFolder>/pd4web.js.
3. Fetches /<bundleFolder>/pd4web.wasm.
4. Initializes patch via Pd4Web class.
5. Stores activePatch and pd4web instance in context.

When stopPatch() is called:

- Applies a fade and closes audio resources.
- Clears active patch context state.

## 5.2 Patch registry and binding contract

File: app/[locale]/map3/pd4web-patches.ts

Patch metadata controls:

- activation.moments: map and/or player.
- activation.compositions: optional composition filter.
- binding:
  - type: map-center or none.
  - Receiver names for lat/lng, accel, co2, list I/O.
  - poll and threshold settings.

Current PD mapping list contract:

App -> Pd (sensor input list):

- Receiver: sensorListReceiver
- Payload order: [gyroX gyroY gyroZ accX accY accZ co2]
- Sent as list values separated by space (PD list standard)

Pd -> App (target output list):

- Receiver callback symbol: outputListReceiver
- Payload order: [latitude longitude]
- Expected as list values separated by space (PD list standard)

Fallback behavior currently implemented in map-center loop:

- If sensor is connected and mappingMethod is pd, app sends sensor list to sensorListReceiver.
- If sensor is not connected, app sends current globe latitude/longitude floats to latitudeReceiver/longitudeReceiver.
- When sensor is not connected, incoming PD output list does not update the globe target.

## 6) Add a Compiled Pd4Web Patch for Map Mode

Goal: add a new map patch driven by map-center/PD bindings.

**Important**
Pre-process: Compile your pd patch using `pd4web` with flags `--export-es6-module` and `--nogui`. You can also change available memory for the patch with `-m 64`, for giving the patch 64mb, for example.

1. Copy compiled patch bundle to public/<your-bundle-folder>/.
2. Confirm bundle contains at least:
   - pd4web.js
   - pd4web.wasm
   - index.pd
   - pd4web.data
3. Add patch entry in app/[locale]/map3/pd4web-patches.ts:
   - unique id
   - label
   - bundleFolder matching public folder
   - activation.moments includes map
   - binding configured with correct PD receiver names
4. Start map patch using the map audio button in map UI.
5. Open patch log panel and validate send/receive behavior.

Example shape:

```ts
{
  id: "myMapPatch",
  label: "My Map Patch",
  bundleFolder: "my-map-patch",
  activation: {
    moments: ["map"],
  },
  binding: {
    type: "map-center",
    latitudeReceiver: "latitude",
    longitudeReceiver: "longitude",
    sensorListReceiver: "input",
    outputListReceiver: "output",
    accXReceiver: "aceX",
    accYReceiver: "aceY",
    accZReceiver: "aceZ",
    co2Receiver: "input_co2",
    pollMs: 64,
    epsilon: 0.5,
    accEpsilon: 0.05,
  },
}
```

## 7) Add Pd4Web Patches for Specific Compositions

There are two valid patterns.

### Pattern A: Dedicated player patch per composition

Use this when the composition should run its own patch in player mode.

Files to edit:

1. app/[locale]/map3/pd4web-patches.ts
   - Add patch with:
     - activation.moments: ["player"]
     - activation.compositions: ["compositionKey"] (recommended for clarity)
2. components/compositions/compositions-info.tsx
   - In that composition entry, set patchId to your patch id.
   - Set keepMapPatch to false or leave undefined.

Runtime behavior:

- In app/[locale]/map3/composition-dropdown.tsx, selecting composition and entering player mode will:
  - stop current map patch (if active and keepMapPatch is false)
  - start the patch referenced by compositionInfo.patchId

Sending and receiving data from Patch with pd4web:
pd4web has several methods for receiving and sending data to patch depending on the data type: `sendBang`, `sendFloat`, `sendList`, `sendSymbol` and `onReceivdBang`, `onReceivedFloat`, `onReceivedList`, `onReceivedSymbol`. Use the appropriat one depending on your case.

- You can send data from the patch in your p5.js sketches usind pd4web dedicated methods `pd4web.sendFloat(receive_name, value)`.
  - **Lighningbolts** sketch has an example on how to send data from sketch to patch.

- You can receive data form the patch in you p5.js sketch using pd4web dedicated listener `pd4web.onRecevedFloat(receive_name, (name: string)=>{ your_code })`.
  - **Lluvia** sketch has an example on how to send a bang to start a patch and how to periodically receive event from the patch and draw on the screen based on the timming of this event.

### Pattern B: Keep map patch while composition is open

Use this when a composition should continue using map patch audio.

Files to edit:

- components/compositions/compositions-info.tsx
  - Set keepMapPatch: true on that composition.

Runtime behavior:

- gaiasenses-map.tsx computes hasSharedPd4WebPatch from keepMapPatch.
- Map patch is allowed to remain active while player composition is displayed.

## 8) How to Add a New Composition

This is the minimum complete checklist.

1. Create composition component

- Add component under components/compositions/<new-composition>/<new-composition>.tsx.

2. Register in composition catalog

File: components/compositions/compositions-info.tsx

- Add import for component.
- Add key to AvailableCompositionNames union.
- Add component type to AvailableCompositionComponents union if needed.
- Add object entry in CompositionsInfo with:
  - name
  - attributes
  - Component
  - endpoints
  - thumb
  - optional author/openProcessingLink
  - optional patchId
  - optional keepMapPatch

3. Make it available in selectors

- CompositionDropdown reads Object.entries(CompositionsInfo), so new entry appears automatically.

4. Optional: include in climate auto-selection

File: app/[locale]/map3/use-composition-queue.ts

- Add the composition key in the category arrays where it should be eligible.

5. Optional: add preset map location

File: app/[locale]/map3/map-constants.ts

- Add a location entry if you want auto mode or preset navigation to target it.

6. Optional: add dedicated audio patch

- If composition needs its own Pd4Web patch, follow Section 7 Pattern A.

## 9) Practical Maintenance Notes

- Patch list I/O debug is visible in app/[locale]/map3/pd4web-patch-log.tsx UI panel.
- For PD mode mapping, always keep receiver names synchronized with Pure Data receive symbols.
- If patch starts but audio is silent, verify bundleFolder and that pd4web.wasm exists in the same public subfolder as pd4web.js.
- If composition switches but wrong patch stays active, inspect:
  - components/compositions/compositions-info.tsx (patchId and keepMapPatch)
  - app/[locale]/map3/composition-dropdown.tsx
  - components/compositions/toggle-play-button.tsx

## 10) First Files to Open for Any Future Change

If you only have 10 minutes to understand a bug, open in this order:

1. app/[locale]/map3/gaiasenses-map.tsx
2. app/[locale]/map3/use-ble-sensor.ts
3. app/[locale]/map3/use-sensor-smoothing.ts
4. app/[locale]/map3/pd4web-context.tsx
5. app/[locale]/map3/pd4web-patches.ts
6. components/compositions/compositions-info.tsx

This path covers almost all behavior coupling in map3.
