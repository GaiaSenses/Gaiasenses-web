/**
 * Critério de decisão: dado o clima, escolhe uma obra.
 *
 * Template method: `avaliar()` faz o trabalho comum (sorteio, cronômetro,
 * fechamento do circuito) e cada critério implementa só `calcular()`.
 */
import type {
  Calculo,
  Candidata,
  ContextoDeDecisao,
  EntradaClima,
  IdCriterio,
  LigacaoDoCircuito,
  NomeEntrada,
  NoDoCircuito,
  ResultadoDeDecisao,
} from "./tipos";

const NOMES_DE_ENTRADA: readonly NomeEntrada[] = [
  "temperature", "humidity", "clouds", "rain", "windSpeed", "windDeg",
  "lightningCount", "fireCount", "closeFires", "lat", "lon",
];

export abstract class CriterioDeDecisao {
  abstract readonly id: IdCriterio;
  abstract readonly versao: number;
  abstract readonly nome: string;
  abstract readonly resumo: string;
  abstract readonly usaMemoria: boolean;
  abstract readonly usaNormal: boolean;
  abstract readonly entradasUsadas: readonly NomeEntrada[];

  protected abstract calcular(entrada: EntradaClima, contexto: ContextoDeDecisao): Calculo;

  avaliar(entrada: EntradaClima, contexto: ContextoDeDecisao): ResultadoDeDecisao {
    const inicio = performance.now();
    const calculo = this.calcular(entrada, contexto);
    const escolha = sortearEntre(calculo, contexto);
    const duracaoMs = performance.now() - inicio;

    return {
      ...calculo,
      circuito: this.completarCircuito(calculo, entrada, contexto, escolha),
      criterio: { id: this.id, versao: this.versao, nome: this.nome },
      escolha,
      duracaoMs,
    };
  }

  /** Acrescenta ao circuito do critério as entradas, as obras e as ligações decisão→obra. */
  private completarCircuito(
    calculo: Calculo,
    entrada: EntradaClima,
    contexto: ContextoDeDecisao,
    escolha: ResultadoDeDecisao["escolha"],
  ): Calculo["circuito"] {
    const nosDeEntrada: NoDoCircuito[] = NOMES_DE_ENTRADA.map((nome) => ({
      id: `entrada:${nome}`,
      estagio: "entrada",
      rotulo: nome,
      valor: entrada[nome] === null ? undefined : String(entrada[nome]),
      ativo: this.entradasUsadas.includes(nome) && entrada[nome] !== null,
    }));

    const nosDeObra: NoDoCircuito[] = contexto.catalogo.map((obra) => ({
      id: `obra:${obra.id}`,
      estagio: "obra",
      rotulo: obra.label,
      ativo: calculo.candidatas.some((c) => c.obra === obra.id),
      ...(obra.id === escolha ? { destaque: true } : {}),
    }));

    const decisao = calculo.circuito.nos.find((no) => no.estagio === "decisao");
    const maxima = Math.max(0, ...calculo.candidatas.map((c) => c.probabilidade));
    const ligacoes: LigacaoDoCircuito[] = decisao
      ? calculo.candidatas.map((c) => ({
          de: decisao.id,
          para: `obra:${c.obra}`,
          ativa: true,
          intensidade: maxima > 0 ? c.probabilidade / maxima : 0,
        }))
      : [];

    return {
      nos: [...nosDeEntrada, ...calculo.circuito.nos, ...nosDeObra],
      ligacoes: [...calculo.circuito.ligacoes, ...ligacoes],
    };
  }
}

/** Sorteia só quando precisa (uniforme/ponderado com candidatas). */
function sortearEntre(
  calculo: Calculo,
  contexto: ContextoDeDecisao,
): ResultadoDeDecisao["escolha"] {
  const candidatas: Candidata[] = calculo.candidatas;
  if (candidatas.length === 0) return null;
  if (calculo.sorteio === "deterministico") return candidatas[0].obra;

  const r = contexto.sortear();
  if (calculo.sorteio === "uniforme") {
    return candidatas[Math.floor(r * candidatas.length)].obra;
  }
  let acumulado = 0;
  for (const c of candidatas) {
    acumulado += c.probabilidade;
    if (r < acumulado) return c.obra;
  }
  return candidatas[candidatas.length - 1].obra;
}
