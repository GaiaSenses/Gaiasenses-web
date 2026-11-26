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
