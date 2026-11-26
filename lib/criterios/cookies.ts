/**
 * Cookies do critério de teste por navegador.
 *
 * - `gaia_criterio` guarda o id do critério que este navegador quer testar no `/map3`.
 * - `gaia_rodizio_<id>` guarda a memória do rodízio daquele critério: obra → tick (segundos) da
 *   última vez que tocou.
 *
 * Os dois chegam de fora, então a leitura é estrita e lixo vira o padrão (id `null`, memória
 * vazia). Nenhum dos dois guarda dado pessoal.
 *
 * Puro e leve: roda no servidor (`page.tsx`) e no navegador (`avancar-rodizio.tsx`), por isso
 * não importa o gerenciador nem os critérios.
 */
import type { IdCriterio, MemoriaDeRodizio, ObraDoCatalogo } from "./tipos";

export const COOKIE_CRITERIO = "gaia_criterio";

export function cookieDoRodizio(id: string): string {
  return `gaia_rodizio_${id}`;
}

/**
 * Os ids registrados no gerenciador, repetidos aqui para não puxar os cinco critérios para o
 * navegador. `tests/criterios-producao.test.ts` prova que as duas listas são a mesma.
 */
export const IDS_REGISTRADOS: readonly IdCriterio[] = ["atual", "A", "B", "C", "D"];

const TAMANHO_MAXIMO_DO_ID = 16;

/** Limite da memória, em caracteres do JSON (o válido é ASCII: ids do catálogo e números). */
const TAMANHO_MAXIMO_DA_MEMORIA = 2048;

/** O id do critério do cookie, ou `null` se não for exatamente um id registrado. */
export function lerIdDoCriterio(valor: string | null | undefined): IdCriterio | null {
  if (typeof valor !== "string" || valor.length === 0 || valor.length > TAMANHO_MAXIMO_DO_ID) {
    return null;
  }
  return IDS_REGISTRADOS.find((id) => id === valor) ?? null;
}

/**
 * A memória do rodízio, só com ids do catálogo e números finitos. JSON inválido, acima de 2 KB
 * ou que não seja um objeto vira memória vazia; uma entrada ruim é descartada sozinha.
 */
export function lerMemoria(
  valor: string | null | undefined,
  catalogo: readonly ObraDoCatalogo[],
): MemoriaDeRodizio {
  if (typeof valor !== "string" || valor.length === 0 || valor.length > TAMANHO_MAXIMO_DA_MEMORIA) {
    return {};
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(valor);
  } catch {
    return {};
  }
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return {};
  }

  const candidato = bruto as Record<string, unknown>;
  const memoria: Record<string, number> = {};
  for (const { id } of catalogo) {
    if (!Object.prototype.hasOwnProperty.call(candidato, id)) continue;
    const tick = candidato[id];
    if (typeof tick === "number" && Number.isFinite(tick)) memoria[id] = tick;
  }
  return memoria;
}

/** O valor do cookie (JSON, antes do `encodeURIComponent`) com `obra` tocada em `tick`. */
export function escreverMemoria(memoria: MemoriaDeRodizio, obra: string, tick: number): string {
  return JSON.stringify({ ...memoria, [obra]: tick });
}
