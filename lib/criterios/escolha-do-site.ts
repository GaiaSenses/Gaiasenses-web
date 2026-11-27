/**
 * A escolha de obra do `/map3`, pura e testável: resolve o critério deste navegador (cookie
 * `gaia_criterio`, validado) e o avalia com a memória do rodízio, quando ele usa memória.
 *
 * Sem cookie, o critério é o padrão (`atual`) e a obra é bit a bit a de hoje; a prova está em
 * `tests/criterios-producao.test.ts`. O `?composition=` da URL continua mandando, e quem cuida
 * disso é a página.
 *
 * Um critério de teste que lança não derruba a página (um 500 para quem testa): o erro vai para o
 * `console.warn` e a escolha é a do padrão, como se o navegador não tivesse cookie.
 */
import type { DeclaredCompositionName } from "@/components/compositions/compositions-declared.generated";
import { catalogoHabilitado } from "./catalogo";
import { lerIdDoCriterio, lerMemoria } from "./cookies";
import type { CriterioDeDecisao } from "./criterio-de-decisao";
import { gerenciador, type GerenciadorDeCriterios } from "./gerenciador";
import type { EntradaClima } from "./tipos";

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

export function escolherObraDoSite(
  {
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
  },
  /** Só os testes passam outro: é por aqui que entra um critério que lança. */
  criterios: GerenciadorDeCriterios = gerenciador,
): EscolhaDoSite {
  const { criterio, origem } = criterios.resolver(lerIdDoCriterio(idDoCookie));
  const padrao = criterios.padrao;
  const catalogo = catalogoHabilitado();
  const escolhaDe = (c: CriterioDeDecisao) =>
    c.avaliar(entrada, {
      catalogo,
      memoria: c.usaMemoria ? lerMemoria(memoriaDoCookie(c.id), catalogo) : {},
      normal: null,
      sortear,
    }).escolha;

  if (criterio !== padrao) {
    try {
      return { obra: escolhaDe(criterio), criterio, origem, deTeste: origem === "navegador" };
    } catch (erro) {
      console.warn(`critério de teste "${criterio.id}" falhou; a escolha segue com o padrão`, erro);
      return { obra: escolhaDe(padrao), criterio: padrao, origem: "padrao", deTeste: false };
    }
  }
  return { obra: escolhaDe(criterio), criterio, origem, deTeste: false };
}
