/**
 * Tipos compartilhados do framework de critérios de decisão.
 * Só tipos: nada aqui carrega React nem os sketches (.tsx).
 */
import type { DeclaredCompositionName } from "@/components/compositions/compositions-declared.generated";
import type { CriterioDeDecisao } from "./criterio-de-decisao";

export type IdCriterio = "atual" | "A" | "B" | "C" | "D";

export type NomeEntrada =
  | "temperature" | "humidity" | "clouds" | "rain" | "windSpeed" | "windDeg"
  | "lightningCount" | "fireCount" | "closeFires" | "lat" | "lon";

export type EntradaClima = Record<NomeEntrada, number | null>;

export type ObraDoCatalogo = {
  id: DeclaredCompositionName;
  label: string;
  attributes: readonly string[];
};

/**
 * Memória do rodízio: obra → tick (segundos) da última vez que ela tocou. Quem tocou há mais tempo
 * vai à frente da fila; uma obra ausente nunca tocou.
 */
export type MemoriaDeRodizio = Readonly<Record<string, number>>;

/** Média e desvio padrão históricos do lugar. */
export type NormalDoLugar = Partial<
  Record<"temperature" | "humidity" | "clouds" | "windSpeed", { mu: number; sd: number }>
>;

export type ContextoDeDecisao = {
  catalogo: readonly ObraDoCatalogo[];
  memoria: MemoriaDeRodizio;
  normal: NormalDoLugar | null;
  /** Fonte de aleatoriedade em [0, 1); injetada para os testes serem determinísticos. */
  sortear: () => number;
};

export type Estagio = "entrada" | "transformacao" | "agregacao" | "decisao" | "obra";

export type NoDoCircuito = {
  id: string;
  estagio: Estagio;
  rotulo: string;
  designador?: string;
  valor?: string;
  ativo: boolean;
  destaque?: boolean;
  grupo?: string;
};

export type LigacaoDoCircuito = { de: string; para: string; ativa: boolean; intensidade: number };

export type Circuito = { nos: NoDoCircuito[]; ligacoes: LigacaoDoCircuito[] };

export type Candidata = { obra: DeclaredCompositionName; probabilidade: number; nota?: string };

export type Calculo = {
  vencedor: { id: string; rotulo: string };
  /**
   * As obras que podem tocar. A ordem faz parte do contrato, porque o sorteio de
   * `CriterioDeDecisao.avaliar` a usa:
   * - `uniforme` (0 e A): a ordem da lista da categoria, a mesma da produção, que sorteia pelo
   *   índice (`Math.floor(r * n)`); mudar a ordem muda a obra de um mesmo `r`.
   * - `deterministico` (B e D): a ordem do rodízio; a primeira é a escolha.
   * - `ponderado` (C): a ordem do catálogo; o `r` cai na faixa acumulada de cada uma, nessa ordem.
   */
  candidatas: Candidata[];
  sorteio: "uniforme" | "ponderado" | "deterministico";
  motivo: string;
  numeros: Record<string, number | null>;
  circuito: Circuito;
};

export type ResultadoDeDecisao = Calculo & {
  criterio: { id: IdCriterio; versao: number; nome: string };
  escolha: DeclaredCompositionName | null;
  duracaoMs: number;
};

export type ResultadoDaComparacao =
  | { criterio: CriterioDeDecisao; ok: true; resultado: ResultadoDeDecisao }
  | { criterio: CriterioDeDecisao; ok: false; erro: string };
