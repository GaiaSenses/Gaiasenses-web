/**
 * Partes comuns aos critérios de cinco categorias (0 · Atual e A · Recalibração):
 * placar, piso, desempate, listas de obras, pontuação por regras e circuito.
 * O que diferencia um critério do outro é só a lista de `REGRAS` e os rótulos.
 */
import type { DeclaredCompositionName } from "@/components/compositions/compositions-declared.generated";
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

export type Regra = {
  id: string;
  designador: string;
  categoria: Exclude<CategoriaAtual, "entropy">;
  entrada: NomeEntrada;
  /** Texto do circuito, ex.: "> 35 → +40" ou "× 4". */
  valor: string;
  /** Quanto este termo soma à categoria; 0 quando a condição não vale. */
  termo: (clima: ClimaDaProducao) => number;
};

const GRUPOS_DE_REGRA = ["fulmen", "pyro", "atmosphere", "hydros"] as const;

export type Pontuacao = {
  scores: PlacarAtual;
  /** Quanto cada grupo de regras somou a cada categoria (a mesma forma da produção). */
  ruleDeltas: Record<string, PlacarAtual>;
  /** Contribuição de cada termo (por id de regra), para o circuito. */
  termos: Record<string, number>;
  categoria: CategoriaAtual;
};

/** Soma sequencial a partir do piso, grupo a grupo, na ordem em que as regras foram escritas. */
export function pontuar(regras: readonly Regra[], clima: ClimaDaProducao): Pontuacao {
  const scores: PlacarAtual = { ...PISO };
  const ruleDeltas: Record<string, PlacarAtual> = {};
  const termos: Record<string, number> = {};

  for (const grupo of GRUPOS_DE_REGRA) {
    const antes = { ...scores };
    for (const regra of regras) {
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

export const casa1 = (n: number) => n.toFixed(1).replace(".", ",");

export function montarCircuito(
  regras: readonly Regra[],
  scores: PlacarAtual,
  termos: Record<string, number>,
  vencedora: CategoriaAtual,
): Calculo["circuito"] {
  const maiorTermo = Math.max(0, ...regras.map((r) => Math.abs(termos[r.id])));
  const maiorScore = Math.max(...ORDEM_CATEGORIAS.map((c) => scores[c]));

  const nosDeRegra: NoDoCircuito[] = regras.map((r) => ({
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
  for (const r of regras) {
    ligacoes.push({
      de: `entrada:${r.entrada}`,
      para: `regra:${r.id}`,
      ativa: termos[r.id] !== 0,
      intensidade: termos[r.id] !== 0 ? 1 : 0,
    });
  }
  for (const r of regras) {
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
