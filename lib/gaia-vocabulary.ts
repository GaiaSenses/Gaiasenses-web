/**
 * The `gaia.*` vocabulary — the contract between a Pure Data patch and the app.
 *
 * A musician does not declare what their patch listens to. They simply put
 * `[r gaia.temp]` in the patch, and the build pipeline discovers it by scanning
 * the `.pd` files (`scripts/pd-introspect.mjs`) and wires it automatically.
 * That is why no TypeScript needs editing to publish a patch.
 *
 * Legacy patches keep working through `aliases`: `[r latitude]` resolves to the
 * `gaia.lat` channel, so the app knows to send latitude to a receiver literally
 * named `latitude`.
 *
 * The data lives in `gaia-vocabulary.json` because the build scripts are plain
 * `.mjs` and need to read the exact same definitions.
 */
import vocabulary from "./gaia-vocabulary.json";

/** Where a channel's value comes from, which decides how the app dispatches it. */
export type GaiaChannelSource = "map" | "sensor" | "weather";

export type GaiaChannelDefinition = {
  id: string;
  /** "in" = app sends to the patch. "out" = patch sends back to the app. */
  direction: "in" | "out";
  kind: "float" | "list";
  /** Number of elements, for list channels. */
  arity?: number;
  source: GaiaChannelSource;
  unit?: string;
  range?: number[];
  /** Historical receiver names that mean the same thing. */
  aliases: string[];
  label: string;
  help?: string;
};

export const GAIA_CHANNELS: readonly GaiaChannelDefinition[] =
  vocabulary.channels as GaiaChannelDefinition[];

/** Canonical channel id, e.g. `"gaia.temp"`. */
export type GaiaChannelId = string;

/**
 * Channel ids as named constants, so the app never spells one as a bare string.
 * A typo here is a compile error; a typo in `"gaia.temp"` would be silence.
 */
export const GAIA = {
  LAT: "gaia.lat",
  LON: "gaia.lon",
  SPEED: "gaia.speed",
  ACC_X: "gaia.acc.x",
  ACC_Y: "gaia.acc.y",
  ACC_Z: "gaia.acc.z",
  CO2: "gaia.co2",
  TEMP: "gaia.temp",
  HUMIDITY: "gaia.humidity",
  CLOUDS: "gaia.clouds",
  RAIN: "gaia.rain",
  WIND_SPEED: "gaia.wind.speed",
  WIND_DEG: "gaia.wind.deg",
  LIGHTNING: "gaia.lightning",
  FIRE: "gaia.fire",
  SENSORS: "gaia.sensors",
  OUT: "gaia.out",
} as const;

const BY_ID = new Map(GAIA_CHANNELS.map((channel) => [channel.id, channel]));

/** Canonical name *and* every alias, mapped to the channel they resolve to. */
const BY_ANY_NAME = new Map<string, GaiaChannelDefinition>();
for (const channel of GAIA_CHANNELS) {
  BY_ANY_NAME.set(channel.id, channel);
  for (const alias of channel.aliases) {
    BY_ANY_NAME.set(alias, channel);
  }
}

/**
 * The secondary receiver names on the map patch, used by the animations that
 * keep it playing (`curves`, `cloudBubble` — both `keepMapPatch: true`).
 *
 * `paraisoGaia43` exposes two independent geographic inputs: `latitude`/
 * `longitude`, fed by the globe, and `lati`/`rotacaoSite`, fed by these sketches.
 * They drive different parts of the patch, so they are not interchangeable and
 * the sketches must keep addressing the second pair. Collected here rather than
 * inlined in four files so the names are searchable and documented.
 *
 * A patch written today should use the canonical channels in `GAIA` instead.
 */
export const GAIA_LEGACY = {
  LAT: "lati",
  LON: "rotacaoSite",
  ACC_X: "aceX",
  ACC_Y: "aceY",
  ACC_Z: "aceZ",
} as const;

export function getGaiaChannel(id: string): GaiaChannelDefinition | undefined {
  return BY_ID.get(id);
}

/**
 * Resolve a receiver name found inside a patch to its channel.
 * Accepts both the canonical `gaia.*` name and any legacy alias.
 */
export function resolveGaiaChannel(
  receiverName: string,
): GaiaChannelDefinition | undefined {
  return BY_ANY_NAME.get(receiverName);
}

/** True when the name is a legacy spelling rather than the canonical one. */
export function isLegacyAlias(receiverName: string): boolean {
  const channel = BY_ANY_NAME.get(receiverName);
  return Boolean(channel) && channel!.id !== receiverName;
}

export function channelsBySource(
  source: GaiaChannelSource,
): GaiaChannelDefinition[] {
  return GAIA_CHANNELS.filter((channel) => channel.source === source);
}
