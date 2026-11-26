/**
 * Critério 0 · Atual: a regra que roda hoje em produção, como classe.
 *
 * Uma única implementação da pontuação (`pontuarAtual`) serve a classe e a fachada
 * `app/[locale]/map3/use-composition-queue.ts`. A ordem das somas e a ordem de desempate
 * são as da produção: qualquer mudança aqui quebra a prova de equivalência em
 * `tests/criterio-atual.test.ts`.
 */
import type { DeclaredCompositionName } from "@/components/compositions/compositions-declared.generated";
import { CriterioDeDecisao } from "./criterio-de-decisao";
import type {
  Calculo,
  EntradaClima,
  LigacaoDoCircuito,
  NomeEntrada,
  NoDoCircuito,
} from "./tipos";

export type CategoriaAtual = "atmosphere" | "fulmen" | "pyro" | "hydros" | "entropy";
export type PlacarAtual = Record<CategoriaAtual, number>;

/** Os sete campos que a produção entrega à escolha (mesmos de `ClimaData`). */
export type ClimaDaProducao = {
  windSpeed: number;
  humidity: number;
  clouds: number;
  temperature: number;
  lightnings: number;
  fireSpots: number;
  rain: number;
};

/** Piso fixo da entropy: nenhuma regra o zera. */
export const PISO: Readonly<PlacarAtual> = {
  atmosphere: 0, fulmen: 0, pyro: 0, hydros: 0, entropy: 25,
};

/** Ordem do desempate: em empate, vence a categoria que vem depois (`reduce` com `>`). */
export const ORDEM_CATEGORIAS: readonly CategoriaAtual[] = [
  "atmosphere", "fulmen", "pyro", "hydros", "entropy",
];

const ROTULO_DA_CATEGORIA: Readonly<Record<CategoriaAtual, string>> = {
  atmosphere: "atmosphere (vento e nuvens)",
  fulmen: "fulmen (raios)",
  pyro: "pyro (fogo e calor)",
  hydros: "hydros (chuva, umidade, temperatura)",
  entropy: "entropy (lugar / abstrato)",
};

/** Lista de obras de cada categoria; a escolha é uniforme sobre ela, na ordem escrita. */
export const CANDIDATAS: Readonly<Record<CategoriaAtual, readonly DeclaredCompositionName[]>> = {
  atmosphere: ["windLines", "cloudBubble", "weatherTree", "stormEye", "pump"],
  fulmen: ["lightningTrees", "lightningBolts", "attractor", "zigzag", "stormEye"],
  pyro: ["bonfire", "burningTrees"],
  hydros: [
    "lluvia", "zigzag", "curves", "digitalOrganism", "rectangles", "nightRain",
    "colorFlower", "mudflatScatter", "generativeStrings", "riverLines", "paintBrush",
  ],
  entropy: ["chaosTree", "airports"],
};

type Regra = {
  id: string;
  designador: string;
  categoria: Exclude<CategoriaAtual, "entropy">;
  entrada: NomeEntrada;
  /** Texto do circuito, ex.: "> 35 → +40" ou "× 4". */
  valor: string;
  /** Quanto este termo soma à categoria; 0 quando a condição não vale. */
  termo: (clima: ClimaDaProducao) => number;
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

const GRUPOS_DE_REGRA = ["fulmen", "pyro", "atmosphere", "hydros"] as const;

export type PontuacaoAtual = {
  scores: PlacarAtual;
  /** Quanto cada grupo de regras somou a cada categoria (a mesma forma da produção). */
  ruleDeltas: Record<string, PlacarAtual>;
  /** Contribuição de cada termo (por id de regra), para o circuito. */
  termos: Record<string, number>;
  categoria: CategoriaAtual;
};

/** Pontuação pura, idêntica à da produção: soma sequencial a partir do piso. */
export function pontuarAtual(clima: ClimaDaProducao): PontuacaoAtual {
  const scores: PlacarAtual = { ...PISO };
  const ruleDeltas: Record<string, PlacarAtual> = {};
  const termos: Record<string, number> = {};

  for (const grupo of GRUPOS_DE_REGRA) {
    const antes = { ...scores };
    for (const regra of REGRAS) {
      if (regra.categoria !== grupo) continue;
      const termo = regra.termo(clima);
      termos[regra.id] = termo;
      scores[grupo] += termo;
    }
    ruleDeltas[grupo] = {
      atmosphere: scores.atmosphere - antes.atmosphere,
      fulmen: scores.fulmen - antes.fulmen,
      pyro: scores.pyro - antes.pyro,
      hydros: scores.hydros - antes.hydros,
      entropy: scores.entropy - antes.entropy,
    };
  }

  const categoria = ORDEM_CATEGORIAS.reduce((a, b) => (scores[a] > scores[b] ? a : b));
  return { scores, ruleDeltas, termos, categoria };
}

/** Como o `page.tsx` monta o clima: indisponível (null ou NaN) vira 0. */
export function climaDaEntrada(entrada: EntradaClima): ClimaDaProducao {
  const z = (v: number | null) => (v === null || Number.isNaN(v) ? 0 : v);
  return {
    windSpeed: z(entrada.windSpeed),
    humidity: z(entrada.humidity),
    clouds: z(entrada.clouds),
    temperature: z(entrada.temperature),
    lightnings: z(entrada.lightningCount),
    fireSpots: z(entrada.fireCount),
    rain: z(entrada.rain),
  };
}

const casa1 = (n: number) => n.toFixed(1).replace(".", ",");

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
      circuito: montarCircuito(scores, termos, categoria),
    };
  }
}

function montarCircuito(
  scores: PlacarAtual,
  termos: Record<string, number>,
  vencedora: CategoriaAtual,
): Calculo["circuito"] {
  const maiorTermo = Math.max(0, ...REGRAS.map((r) => Math.abs(termos[r.id])));
  const maiorScore = Math.max(...ORDEM_CATEGORIAS.map((c) => scores[c]));

  const nosDeRegra: NoDoCircuito[] = REGRAS.map((r) => ({
    id: `regra:${r.id}`,
    estagio: "transformacao",
    rotulo: r.id,
    designador: r.designador,
    valor: r.valor,
    ativo: termos[r.id] !== 0,
    grupo: r.categoria,
  }));

  const nosDeCategoria: NoDoCircuito[] = ORDEM_CATEGORIAS.map((c) => ({
    id: `categoria:${c}`,
    estagio: "agregacao",
    rotulo: c,
    valor: c === "entropy" ? `${casa1(scores[c])} (piso)` : casa1(scores[c]),
    ativo: c === vencedora,
    grupo: c,
  }));

  const decisao: NoDoCircuito = {
    id: "decisao:max",
    estagio: "decisao",
    rotulo: "maior placar",
    ativo: true,
  };

  const ligacoes: LigacaoDoCircuito[] = [];
  for (const r of REGRAS) {
    ligacoes.push({
      de: `entrada:${r.entrada}`,
      para: `regra:${r.id}`,
      ativa: termos[r.id] !== 0,
      intensidade: termos[r.id] !== 0 ? 1 : 0,
    });
  }
  for (const r of REGRAS) {
    ligacoes.push({
      de: `regra:${r.id}`,
      para: `categoria:${r.categoria}`,
      ativa: termos[r.id] !== 0,
      intensidade: maiorTermo > 0 ? Math.abs(termos[r.id]) / maiorTermo : 0,
    });
  }
  for (const c of ORDEM_CATEGORIAS) {
    ligacoes.push({
      de: `categoria:${c}`,
      para: decisao.id,
      ativa: c === vencedora,
      intensidade:
        maiorScore > 0 ? Math.min(1, Math.max(0, scores[c] / maiorScore)) : 0,
    });
  }

  return { nos: [...nosDeRegra, ...nosDeCategoria, decisao], ligacoes };
}
