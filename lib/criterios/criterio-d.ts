/**
 * Critério D · Relativo ao lugar: como o B, mas calor, frio, vento, umidade e nuvens contam
 * pela anomalia em relação ao normal da cidade. Sem normal, vira o B.
 * A equivalência com o `criterioD` do estudo está em `tests/criterio-b-d.test.ts`.
 */
import { CriterioDeDecisao } from "./criterio-de-decisao";
import { calculoDoRodizio } from "./dominante-rodizio";
import type { Calculo, ContextoDeDecisao, EntradaClima, NomeEntrada } from "./tipos";

export class CriterioD extends CriterioDeDecisao {
  readonly id = "D";
  readonly versao = 1;
  readonly nome = "Relativo ao lugar";
  readonly resumo =
    "Como B, mas calor, frio, vento e umidade contam pela anomalia em relação ao normal da cidade.";
  readonly usaMemoria = true;
  readonly usaNormal = true;
  readonly entradasUsadas: readonly NomeEntrada[] = [
    "temperature", "humidity", "clouds", "rain", "windSpeed", "lightningCount", "fireCount", "closeFires",
  ];

  protected calcular(entrada: EntradaClima, contexto: ContextoDeDecisao): Calculo {
    const { calculo } = calculoDoRodizio(entrada, contexto, "rel");
    if (contexto.normal !== null) return calculo;
    return { ...calculo, motivo: `${calculo.motivo} Sem normal do lugar: igual ao B.` };
  }
}
