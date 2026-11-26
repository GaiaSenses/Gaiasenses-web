/**
 * Critério 0 · Atual: a regra que roda hoje em produção, como classe.
 *
 * Uma única implementação da pontuação (`pontuarAtual`) serve a classe e a fachada
 * `app/[locale]/map3/use-composition-queue.ts`. A ordem das somas e a ordem de desempate
 * são as da produção: qualquer mudança aqui quebra a prova de equivalência em
 * `tests/criterio-atual.test.ts`.
 */
import { CriterioDeDecisao } from "./criterio-de-decisao";
import {
  CANDIDATAS, ORDEM_CATEGORIAS, PISO, casa1, climaDaEntrada, montarCircuito, pontuar,
} from "./categorias";
import type { CategoriaAtual, ClimaDaProducao, Pontuacao, Regra } from "./categorias";
import type { Calculo, EntradaClima, NomeEntrada } from "./tipos";

export { CANDIDATAS, ORDEM_CATEGORIAS, PISO, climaDaEntrada };
export type { CategoriaAtual, ClimaDaProducao };
export type { PlacarAtual } from "./categorias";

export type PontuacaoAtual = Pontuacao;

const ROTULO_DA_CATEGORIA: Readonly<Record<CategoriaAtual, string>> = {
  atmosphere: "atmosphere (vento e nuvens)",
  fulmen: "fulmen (raios)",
  pyro: "pyro (fogo e calor)",
  hydros: "hydros (chuva, umidade, temperatura)",
  entropy: "entropy (lugar / abstrato)",
};

/**
 * Na ordem de soma da produção: fulmen, pyro (fogo, calor), atmosphere (vento, nuvens),
 * hydros (chuva, umidade, temperatura). Não reordenar: muda os bits do resultado.
 */
export const REGRAS: readonly Regra[] = [
  { id: "raios", designador: "U1", categoria: "fulmen", entrada: "lightningCount",
    valor: "> 0 → +90", termo: (c) => (c.lightnings > 0 ? 90 : 0) },
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
  { id: "umidade", designador: "U7", categoria: "hydros", entrada: "humidity",
    valor: "× 0,5", termo: (c) => c.humidity * 0.5 },
  { id: "temperatura", designador: "U8", categoria: "hydros", entrada: "temperature",
    valor: "× 0,3", termo: (c) => c.temperature * 0.3 },
];

/** Pontuação pura, idêntica à da produção. */
export function pontuarAtual(clima: ClimaDaProducao): PontuacaoAtual {
  return pontuar(REGRAS, clima);
}

export class CriterioAtual extends CriterioDeDecisao {
  readonly id = "atual";
  readonly versao = 1;
  readonly nome = "0 · Atual";
  readonly resumo =
    "Soma pontos por regra fixa em cinco categorias, fica com a maior e sorteia uma obra da lista dela.";
  readonly usaMemoria = false;
  readonly usaNormal = false;
  readonly entradasUsadas: readonly NomeEntrada[] = [
    "temperature", "humidity", "clouds", "rain", "windSpeed", "lightningCount", "fireCount",
  ];

  protected calcular(entrada: EntradaClima): Calculo {
    const { scores, termos, categoria } = pontuarAtual(climaDaEntrada(entrada));
    const lista = CANDIDATAS[categoria];

    return {
      vencedor: { id: categoria, rotulo: ROTULO_DA_CATEGORIA[categoria] },
      candidatas: lista.map((obra) => ({ obra, probabilidade: 1 / lista.length })),
      sorteio: "uniforme",
      motivo:
        `A categoria ${ROTULO_DA_CATEGORIA[categoria]} somou ${casa1(scores[categoria])} pontos, ` +
        `o maior placar; a obra sai por sorteio uniforme entre as ${lista.length} da lista.`,
      numeros: { ...scores },
      circuito: montarCircuito(REGRAS, scores, termos, categoria),
    };
  }
}

