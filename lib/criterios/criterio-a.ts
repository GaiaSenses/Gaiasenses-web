/**
 * Critério A · Recalibração: as mesmas cinco categorias, listas e sorteio do critério 0,
 * com os pesos corrigidos do parecer (issue #106): raios +120, umidade só acima de 80 e
 * temperatura fora de hydros. A equivalência com o `criterioA` do estudo está em
 * `tests/criterio-a.test.ts`.
 */
import { CriterioDeDecisao } from "./criterio-de-decisao";
import {
  CANDIDATAS, casa1, climaDaEntrada, montarCircuito, pontuar,
} from "./categorias";
import type { CategoriaAtual, Regra } from "./categorias";
import type { Calculo, EntradaClima, NomeEntrada } from "./tipos";

const ROTULO_DA_CATEGORIA: Readonly<Record<CategoriaAtual, string>> = {
  atmosphere: "atmosphere (vento e nuvens)",
  fulmen: "fulmen (raios)",
  pyro: "pyro (fogo e calor)",
  hydros: "hydros (chuva e umidade)",
  entropy: "entropy (lugar / abstrato)",
};

/**
 * Na ordem de soma do estudo: fulmen, pyro (fogo, calor), atmosphere (vento, nuvens),
 * hydros (chuva, umidade). Não reordenar: muda os bits do resultado.
 */
export const REGRAS_A: readonly Regra[] = [
  { id: "raios", designador: "U1", categoria: "fulmen", entrada: "lightningCount",
    valor: "> 0 → +120", termo: (c) => (c.lightnings > 0 ? 120 : 0) },
  { id: "fogo", designador: "U2", categoria: "pyro", entrada: "fireCount",
    valor: "> 0 → +100", termo: (c) => (c.fireSpots > 0 ? 100 : 0) },
  { id: "calor", designador: "U3", categoria: "pyro", entrada: "temperature",
    valor: "> 35 → +40", termo: (c) => (c.temperature > 35 ? 40 : 0) },
  { id: "vento", designador: "U4", categoria: "atmosphere", entrada: "windSpeed",
    valor: "× 4", termo: (c) => c.windSpeed * 4 },
  { id: "nuvens", designador: "U5", categoria: "atmosphere", entrada: "clouds",
    valor: "> 50 → +30", termo: (c) => (c.clouds > 50 ? 30 : 0) },
  { id: "chuva", designador: "U6", categoria: "hydros", entrada: "rain",
    valor: "× 5", termo: (c) => c.rain * 5 },
  // Termo proporcional que só liga acima do limiar: 80 não soma, 81 soma 40,5.
  { id: "umidade", designador: "U7", categoria: "hydros", entrada: "humidity",
    valor: "> 80 → × 0,5", termo: (c) => (c.humidity > 80 ? c.humidity * 0.5 : 0) },
];

export class CriterioA extends CriterioDeDecisao {
  readonly id = "A";
  readonly versao = 1;
  readonly nome = "Recalibração";
  readonly resumo =
    "As mesmas 5 categorias e listas, com os pesos corrigidos que o parecer sugeriu.";
  readonly usaMemoria = false;
  readonly usaNormal = false;
  readonly entradasUsadas: readonly NomeEntrada[] = [
    "temperature", "humidity", "clouds", "rain", "windSpeed", "lightningCount", "fireCount",
  ];

  protected calcular(entrada: EntradaClima): Calculo {
    const { scores, termos, categoria } = pontuar(REGRAS_A, climaDaEntrada(entrada));
    const lista = CANDIDATAS[categoria];

    return {
      vencedor: { id: categoria, rotulo: ROTULO_DA_CATEGORIA[categoria] },
      candidatas: lista.map((obra) => ({ obra, probabilidade: 1 / lista.length })),
      sorteio: "uniforme",
      motivo:
        `A categoria ${ROTULO_DA_CATEGORIA[categoria]} somou ${casa1(scores[categoria])} pontos, ` +
        `o maior placar; a obra sai por sorteio uniforme entre as ${lista.length} da lista.`,
      numeros: { ...scores },
      circuito: montarCircuito(REGRAS_A, scores, termos, categoria),
    };
  }
}
