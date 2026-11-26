/**
 * A escolha de obra do `/map3`, pura e testável: resolve o critério deste navegador (cookie
 * `gaia_criterio`, validado) e o avalia com a memória do rodízio, quando ele usa memória.
 *
 * Sem cookie, o critério é o padrão (`atual`) e a obra é bit a bit a de hoje; a prova está em
 * `tests/criterios-producao.test.ts`. O `?composition=` da URL continua mandando, e quem cuida
 * disso é a página.
 */
import type { DeclaredCompositionName } from "@/components/compositions/compositions-declared.generated";
import { catalogoHabilitado } from "./catalogo";
import { lerIdDoCriterio, lerMemoria } from "./cookies";
import type { CriterioDeDecisao } from "./criterio-de-decisao";
import { CRITERIO_PADRAO_ID, gerenciador } from "./gerenciador";
import type { ContextoDeDecisao, EntradaClima } from "./tipos";

export type EscolhaDoSite = {
  obra: DeclaredCompositionName | null;
  criterio: CriterioDeDecisao;
  origem: "padrao" | "navegador";
  /**
   * Este navegador pediu um critério diferente do padrão. O que ele toca não representa o
   * público, então não entra no corpus (GaiaLogs) e a página mostra o aviso.
   */
  deTeste: boolean;
};

export function escolherObraDoSite({
  entrada,
  idDoCookie,
  memoriaDoCookie,
  sortear,
}: {
  entrada: EntradaClima;
  /** Valor cru do cookie `gaia_criterio`. */
  idDoCookie: string | null | undefined;
  /** Valor cru do cookie `gaia_rodizio_<id>`; só é lido se o critério usa memória. */
  memoriaDoCookie: (criterioId: string) => string | null | undefined;
  sortear: () => number;
}): EscolhaDoSite {
  const { criterio, origem } = gerenciador.resolver(lerIdDoCriterio(idDoCookie));
  const catalogo = catalogoHabilitado();
  const contexto: ContextoDeDecisao = {
    catalogo,
    memoria: criterio.usaMemoria ? lerMemoria(memoriaDoCookie(criterio.id), catalogo) : {},
    normal: null,
    sortear,
  };

  return {
    obra: criterio.avaliar(entrada, contexto).escolha,
    criterio,
    origem,
    deTeste: origem === "navegador" && criterio.id !== CRITERIO_PADRAO_ID,
  };
}
