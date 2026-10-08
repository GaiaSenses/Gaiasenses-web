/**
 * As partes puras da rota pública /api/v1/now.
 *
 * Vivem fora de route.ts porque o Next só admite handlers e campos de
 * configuração como exports de uma rota — e porque puras elas se testam sem
 * stubar rede: é assim que o caminho feliz do clima, impossível de simular
 * via fetch (a Open-Meteo responde flatbuffers), fica coberto.
 */
import type { OpenMeteoCurrent } from "@/components/getOpenMeteo";

export type SourceStatus = "ok" | "unavailable" | "timeout";

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
} as const;

/**
 * O TTL da CDN acompanha o estado da resposta: saudável aguenta 10 min (menos
 * que o revalidate de 15 min do clima, então staleness máxima ~25 min);
 * degradada cai para 1 min, para a recuperação da fonte aparecer rápido em
 * vez de ficar presa num cache longo.
 */
export function cacheControlFor(
  sources: Record<string, SourceStatus>,
): string {
  const tudoOk = Object.values(sources).every((s) => s === "ok");
  return tudoOk
    ? "public, s-maxage=600, stale-while-revalidate=1800"
    : "public, s-maxage=60";
}

/** Sentinela de comTimeout: distingue "demorou demais" de "respondeu que não sabe". */
export const TIMEOUT = Symbol("timeout");

export async function comTimeout<T>(
  promessa: Promise<T>,
  ms: number,
): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promessa,
      new Promise<typeof TIMEOUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const umaCasa = (v: number) => Number(v.toFixed(1));

function numeroOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** O bloco `weather` público, direto do current da Open-Meteo. */
export function mapOpenMeteoCurrent(c: OpenMeteoCurrent) {
  return {
    temperature: umaCasa(c.temperature2m),
    apparentTemperature: umaCasa(c.apparentTemperature),
    humidity: c.relativeHumidity2m,
    surfacePressure: umaCasa(c.surfacePressure),
    pressureMsl: umaCasa(c.pressureMsl),
    cloudCover: c.cloudCover,
    precipitation: c.precipitation,
    rain: c.rain,
    showers: c.showers,
    snowfall: c.snowfall,
    // Código WMO cru: descrição e idioma são escolha de quem consome.
    weatherCode: c.weatherCode,
    wind: {
      speed: umaCasa(c.windSpeed10m),
      direction: umaCasa(c.windDirection10m),
      gust: umaCasa(c.windGusts10m),
    },
    isDay: c.isDay === 1,
    observedAt: c.time.toISOString(),
  };
}

type EventoCru = Record<string, unknown>;

/**
 * O backend responde hoje `latitude`/`longitude`/`"energy (pJ)"`/`bright_ti4`
 * — não o que os tipos legados de getData prometem. A rota pública não
 * republica nem o shape cru nem confia no tipo errado: normaliza aceitando as
 * duas grafias, e o que não vier numérico vira null.
 */
export function mapLightningEvents(events: unknown) {
  if (!Array.isArray(events)) return [];
  return events.map((e: EventoCru) => ({
    lat: numeroOuNull(e.latitude ?? e.lat),
    lon: numeroOuNull(e.longitude ?? e.lon),
    energyPj: numeroOuNull(e["energy (pJ)"]),
  }));
}

export function mapFireEvents(events: unknown) {
  if (!Array.isArray(events)) return [];
  return events.map((e: EventoCru) => ({
    lat: numeroOuNull(e.latitude ?? e.lat),
    lon: numeroOuNull(e.longitude ?? e.lon),
    brightness: numeroOuNull(e.bright_ti4),
  }));
}

/** O /rain guarda a taxa (mm/h) num campo chamado `count`; aqui ela ganha nome. */
export function mapRain(resp: { count: number }) {
  return { rateMmH: resp.count };
}

export { numeroOuNull };
