/**
 * Entrada do site: traduz as três fontes que o `/map3` já busca (clima, raios e focos) para o
 * vocabulário dos critérios.
 *
 * Indisponível vira `null`, nunca 0: B, C e D distinguem "sem dado" de "nada medido". Quem
 * precisa de zero (o critério atual, igual à produção) faz a troca por conta própria.
 */
import type {
  FireSpotsResponseData,
  LightningResponseData,
  RainfallResponseData,
} from "@/components/getData";
import type { EntradaClima } from "./tipos";

/** Raio, em km, dos focos "perto"; o mesmo de `composition-data.ts` e do estudo. */
export const RAIO_DOS_FOCOS_PROXIMOS_KM = 50;

export type FontesDoSite = {
  weatherData: RainfallResponseData | null | undefined;
  lightningData: LightningResponseData | null | undefined;
  fireSpotsData: FireSpotsResponseData | null | undefined;
  /** Os números que a página já usa (o `parseFloat` da URL). */
  lat: number;
  lng: number;
};

/** NaN, undefined, null e o que não for número finito viram null. */
function numeroOuNull(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

/** Focos a menos de 50 km; sem a lista de eventos não dá para saber, e o valor é null. */
function focosProximos(fogo: FontesDoSite["fireSpotsData"]): number | null {
  if (!fogo || !Array.isArray(fogo.events)) return null;
  return fogo.events.filter(
    (evento) => numeroOuNull(evento?.dist) !== null && evento.dist < RAIO_DOS_FOCOS_PROXIMOS_KM,
  ).length;
}

export function paraEntradaClima({
  weatherData,
  lightningData,
  fireSpotsData,
  lat,
  lng,
}: FontesDoSite): EntradaClima {
  // Mesma fonte que a página usa para a chuva: o `rain["1h"]` do clima.
  const chuva = (weatherData?.rain as { "1h"?: number } | undefined)?.["1h"];

  return {
    temperature: numeroOuNull(weatherData?.main?.temp),
    humidity: numeroOuNull(weatherData?.main?.humidity),
    clouds: numeroOuNull(weatherData?.clouds),
    rain: numeroOuNull(chuva),
    windSpeed: numeroOuNull(weatherData?.wind?.speed),
    windDeg: numeroOuNull(weatherData?.wind?.deg),
    lightningCount: numeroOuNull(lightningData?.count),
    fireCount: numeroOuNull(fireSpotsData?.count),
    closeFires: focosProximos(fireSpotsData),
    lat: numeroOuNull(lat),
    lon: numeroOuNull(lng),
  };
}
