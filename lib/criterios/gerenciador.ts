/**
 * Gerenciador de critérios: registro, escolha do padrão e comparação.
 */
import type { CriterioDeDecisao } from "./criterio-de-decisao";
import type {
  ContextoDeDecisao,
  EntradaClima,
  IdCriterio,
  ResultadoDaComparacao,
} from "./tipos";

export class GerenciadorDeCriterios {
  private readonly criterios: readonly CriterioDeDecisao[];
  private readonly padraoCriterio: CriterioDeDecisao;

  constructor(criterios: readonly CriterioDeDecisao[], padraoId: IdCriterio) {
    const vistos = new Set<string>();
    for (const c of criterios) {
      if (vistos.has(c.id)) throw new Error(`Critério duplicado: ${c.id}`);
      vistos.add(c.id);
    }
    const padrao = criterios.find((c) => c.id === padraoId);
    if (!padrao) throw new Error(`Critério padrão desconhecido: ${padraoId}`);
    this.criterios = criterios;
    this.padraoCriterio = padrao;
  }

  get padrao(): CriterioDeDecisao {
    return this.padraoCriterio;
  }

  listar(): readonly CriterioDeDecisao[] {
    return this.criterios;
  }

  obter(id: string): CriterioDeDecisao | null {
    return this.criterios.find((c) => c.id === id) ?? null;
  }

  resolver(idDoNavegador: string | null | undefined): {
    criterio: CriterioDeDecisao;
    origem: "padrao" | "navegador";
  } {
    const escolhido = idDoNavegador ? this.obter(idDoNavegador) : null;
    return escolhido
      ? { criterio: escolhido, origem: "navegador" }
      : { criterio: this.padraoCriterio, origem: "padrao" };
  }

  /** Avalia todos em série, na ordem de registro; a falha de um não derruba os outros. */
  avaliarTodos(
    entrada: EntradaClima,
    contextoDe: (c: CriterioDeDecisao) => ContextoDeDecisao,
  ): ResultadoDaComparacao[] {
    return this.criterios.map((criterio): ResultadoDaComparacao => {
      try {
        return { criterio, ok: true, resultado: criterio.avaliar(entrada, contextoDe(criterio)) };
      } catch (e) {
        return { criterio, ok: false, erro: e instanceof Error ? e.message : String(e) };
      }
    });
  }
}
