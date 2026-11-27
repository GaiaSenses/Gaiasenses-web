/**
 * Critério B · Dominante + rodízio: vence o fenômeno mais saliente (escalas fixas) e, dentro
 * do tipo, toca a obra que está há mais tempo sem tocar. Determinístico, com memória.
 * A equivalência com o `criterioB` do estudo está em `tests/criterio-b-d.test.ts`.
 */
import { CriterioDeDecisao } from "./criterio-de-decisao";
import { calculoDoRodizio } from "./dominante-rodizio";
import type { Calculo, ContextoDeDecisao, EntradaClima, NomeEntrada } from "./tipos";

export class CriterioB extends CriterioDeDecisao {
  readonly id = "B";
  readonly versao = 1;
  readonly nome = "Dominante + rodízio";
  readonly resumo =
    "Vence o fenômeno mais saliente; toca a obra daquele tipo que está há mais tempo sem tocar.";
  readonly usaMemoria = true;
  readonly usaNormal = false;
  readonly entradasUsadas: readonly NomeEntrada[] = [
    "temperature", "humidity", "clouds", "rain", "windSpeed", "lightningCount", "fireCount", "closeFires",
  ];

  protected calcular(entrada: EntradaClima, contexto: ContextoDeDecisao): Calculo {
    return calculoDoRodizio(entrada, contexto, "abs").calculo;
  }
}
