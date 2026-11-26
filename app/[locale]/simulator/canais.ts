/**
 * Os canais gaia.* que o simulador envia ao patch a partir da entrada do cenário.
 */
import { GAIA } from "@/lib/gaia-vocabulary";
import type { EntradaClima, NomeEntrada } from "@/lib/criterios/tipos";

const CANAIS: readonly [string, NomeEntrada][] = [
  [GAIA.TEMP, "temperature"],
  [GAIA.HUMIDITY, "humidity"],
  [GAIA.CLOUDS, "clouds"],
  [GAIA.RAIN, "rain"],
  [GAIA.WIND_SPEED, "windSpeed"],
  [GAIA.WIND_DEG, "windDeg"],
  [GAIA.LIGHTNING, "lightningCount"],
  [GAIA.FIRE, "fireCount"],
  [GAIA.LAT, "lat"],
  [GAIA.LON, "lon"],
];

/** Os canais de clima (lat e lon não contam: dizem onde, não como está o tempo). */
const CANAIS_DE_CLIMA: readonly string[] = CANAIS.map(([canal]) => canal).filter((c) => c !== GAIA.LAT && c !== GAIA.LON);

/** O patch ouve algum canal de clima? Se não ouve, mexer no cenário não muda o som dele. */
export function leOClima(receivers: Readonly<Record<string, string>>): boolean {
  return CANAIS_DE_CLIMA.some((canal) => receivers[canal] !== undefined);
}

/** Só os canais que o patch recebe (`receivers`) e cujo valor não é null. */
export function canaisDoCenario(e: EntradaClima, receivers: Record<string, string>): [receiver: string, valor: number][] {
  const saida: [string, number][] = [];
  for (const [canal, nome] of CANAIS) {
    const valor = e[nome];
    const receiver = receivers[canal];
    if (valor !== null && receiver !== undefined) saida.push([receiver, valor]);
  }
  return saida;
}
