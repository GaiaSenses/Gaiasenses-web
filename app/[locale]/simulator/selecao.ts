/**
 * Qual obra o simulador mostra: a do critério ou a que o pesquisador escolheu à mão.
 * Lógica pura, genérica sobre o critério.
 */
import type { DeclaredCompositionName } from "@/components/compositions/compositions-declared.generated";
import type { ResultadoDeDecisao } from "@/lib/criterios/tipos";

export type Selecao = { obra: DeclaredCompositionName | null; origem: "criterio" | "manual" };

function ehCandidata(r: ResultadoDeDecisao, obra: DeclaredCompositionName): boolean {
  const c = r.candidatas.find((x) => x.obra === obra);
  if (!c) return false;
  return c.probabilidade > 0 || r.sorteio === "deterministico";
}

export function proximaSelecao(anterior: Selecao | null, r: ResultadoDeDecisao): Selecao {
  if (anterior?.origem === "manual" && anterior.obra && ehCandidata(r, anterior.obra)) return anterior;
  // Sorteio: enquanto a obra segue possível, não troca (senão a obra pisca a cada novo valor).
  if (r.sorteio !== "deterministico" && anterior?.obra) {
    const c = r.candidatas.find((x) => x.obra === anterior.obra);
    if (c && c.probabilidade > 0) return { obra: anterior.obra, origem: "criterio" };
  }
  return { obra: r.escolha, origem: "criterio" };
}

/**
 * A seleção enquanto a obra toca: ela fica enquanto continuar candidata, mesmo no rodízio. A
 * memória que avançou ao tocar vale para a próxima escolha, e não para a que está tocando; sem
 * isto, cada avanço trocaria a obra, que avançaria a memória de novo, sem fim.
 */
export function manterAoTocar(anterior: Selecao | null, r: ResultadoDeDecisao): Selecao {
  if (anterior?.obra && ehCandidata(r, anterior.obra)) return anterior;
  return proximaSelecao(anterior, r);
}

export function escolherManual(anterior: Selecao, r: ResultadoDeDecisao, obra: DeclaredCompositionName): Selecao {
  if (!r.candidatas.some((c) => c.obra === obra)) return anterior;
  return { obra, origem: "manual" };
}

/** Lê a seleção da URL (`obra=<id>`, `origem=manual`); sem `obra` válida entre as candidatas, devolve null. */
export function lerSelecao(p: URLSearchParams, r: ResultadoDeDecisao): Selecao | null {
  const obra = p.get("obra");
  const c = r.candidatas.find((x) => x.obra === obra);
  if (!c) return null;
  return { obra: c.obra, origem: p.get("origem") === "manual" ? "manual" : "criterio" };
}

export function escreverSelecao(p: URLSearchParams, s: Selecao): URLSearchParams {
  const saida = new URLSearchParams(p);
  if (s.obra) saida.set("obra", s.obra);
  else saida.delete("obra");
  if (s.origem === "manual") saida.set("origem", "manual");
  else saida.delete("origem");
  return saida;
}
