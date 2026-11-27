/**
 * Critério C · Aderência por obra: cada obra pontua pelo quanto os próprios dados dela estão
 * em evidência, e o sorteio é ponderado pela aderência ao cubo. Sem memória.
 * Porte fiel de `aderencia`, `criterioC` e `tipoMaisSaliente` do estudo
 * (`tests/fixtures/estudo-criterios.cjs`); a equivalência está em `tests/criterio-c.test.ts`.
 */
import { CriterioDeDecisao } from "./criterio-de-decisao";
import { ligacoesEntradaTipo, nosDeTipo } from "./dominante-rodizio";
import {
  CALMARIA, LIMIARES, TYPES, TYPE_BY_ID, familiasDaObra, fmt, saliencias, tiposDaObra,
} from "./saliencia";
import type { FamiliaDeDado, MapaDeSaliencia, TipoId } from "./saliencia";
import type {
  Calculo, ContextoDeDecisao, EntradaClima, LigacaoDoCircuito, NomeEntrada, NoDoCircuito,
  ObraDoCatalogo,
} from "./tipos";

type Aderencia = { a: number; porFam: Partial<Record<FamiliaDeDado, number>> };
type LinhaDaObra = Aderencia & { id: ObraDoCatalogo["id"]; label: string };

/** Saliência de cada família: a maior entre os tipos dela que têm dado. */
function maximoDaFamilia(S: MapaDeSaliencia, fam: FamiliaDeDado): number | null {
  const valores = TYPES.filter((t) => t.fam === fam && S[t.id] !== null).map((t) => S[t.id] as number);
  return valores.length ? Math.max(...valores) : null;
}

/** 0,7·máximo + 0,3·média das famílias da obra; sem entrada meteorológica ou sem dado, o piso. */
function aderencia(obra: Pick<ObraDoCatalogo, "attributes">, S: MapaDeSaliencia): Aderencia {
  const fams = familiasDaObra(obra);
  if (!fams.length) return { a: LIMIARES.piso, porFam: {} };
  const porFam: Aderencia["porFam"] = {};
  for (const f of fams) {
    const m = maximoDaFamilia(S, f);
    if (m !== null) porFam[f] = m;
  }
  const vs = Object.values(porFam);
  if (!vs.length) return { a: LIMIARES.piso, porFam };
  const mx = Math.max(...vs);
  const media = vs.reduce((x, y) => x + y, 0) / vs.length;
  return { a: 0.7 * mx + 0.3 * media, porFam };
}

/** O tipo pelo qual uma obra está tocando: o mais saliente entre os dela. */
function tipoMaisSaliente(obra: Pick<ObraDoCatalogo, "attributes">, S: MapaDeSaliencia): TipoId | "calmaria" {
  let melhor: TipoId | "calmaria" = "calmaria";
  let bs = -1;
  for (const t of tiposDaObra(obra)) {
    if (t === "calmaria" || S[t] === null) continue;
    if ((S[t] as number) > bs) { bs = S[t] as number; melhor = t; }
  }
  return bs >= LIMIARES.piso ? melhor : "calmaria";
}

const FAMILIAS: readonly FamiliaDeDado[] = [...new Set(TYPES.map((t) => t.fam))];

export class CriterioC extends CriterioDeDecisao {
  readonly id = "C";
  readonly versao = 1;
  readonly nome = "Aderência por obra";
  readonly resumo =
    "Cada obra pontua pelo quanto os próprios dados dela estão em evidência; sorteio ponderado.";
  readonly usaMemoria = false;
  readonly usaNormal = false;
  readonly entradasUsadas: readonly NomeEntrada[] = [
    "temperature", "humidity", "clouds", "rain", "windSpeed", "lightningCount", "fireCount", "closeFires",
  ];

  protected calcular(entrada: EntradaClima, contexto: ContextoDeDecisao): Calculo {
    const piso = LIMIARES.piso;
    const S = saliencias(entrada, { modo: "abs" }).S;
    const lista: LinhaDaObra[] = contexto.catalogo.map((ob) => ({ id: ob.id, label: ob.label, ...aderencia(ob, S) }));
    const amax = Math.max(...lista.map((x) => x.a));
    // Na ordem do catálogo: é a ordem em que a base percorre o sorteio.
    const cand = lista.filter((x) => x.a >= amax * 0.5 && x.a > 0);
    const w = cand.map((x) => Math.pow(x.a, 3));
    const tot = w.reduce((x, y) => x + y, 0) || 1;
    const prob = cand.map((_, i) => w[i] / tot);

    // O topo é a mais provável; o empate fica com a que vem antes no catálogo (sort estável).
    const ordenadas = cand.map((x, i) => ({ x, p: prob[i] })).sort((a, b) => b.p - a.p);
    const top = ordenadas.length ? ordenadas[0].x : null;
    const topFams = top ? Object.entries(top.porFam).sort((a, b) => b[1] - a[1]) : [];
    const motivo = !top
      ? "Nenhuma obra."
      : topFams.length && top.a > piso
        ? `${top.label} tem a maior aderência (${fmt(top.a, 2)}): ${topFams.filter(([, v]) => v > 0).map(([f, v]) => `${f} ${fmt(v, 2)}`).join(", ") || "dados fracos"}. ${cand.length} obras entram no sorteio, com chance proporcional à aderência ao cubo.`
        : `Nenhuma obra se destaca acima do piso. ${cand.length} obras entram no sorteio, e as sem entrada meteorológica ficam no piso (${fmt(piso, 2)}).`;

    const topObra = top ? contexto.catalogo.find((ob) => ob.id === top.id) : undefined;
    const tipoVencedor = topObra ? tipoMaisSaliente(topObra, S) : "calmaria";

    return {
      vencedor: {
        id: tipoVencedor,
        rotulo: tipoVencedor === "calmaria" ? CALMARIA.label : TYPE_BY_ID[tipoVencedor].label,
      },
      candidatas: cand.map((x, i) => ({
        obra: x.id, probabilidade: prob[i], nota: `aderência ${fmt(x.a, 2)}`,
      })),
      sorteio: "ponderado",
      motivo,
      numeros: { ...S },
      circuito: montarCircuito(S, cand, contexto.catalogo),
    };
  }
}

/** Circuito: entradas → tipos → famílias → sorteio ponderado (as obras vêm da base). */
function montarCircuito(
  S: MapaDeSaliencia,
  cand: readonly LinhaDaObra[],
  catalogo: readonly ObraDoCatalogo[],
): Calculo["circuito"] {
  const nos: NoDoCircuito[] = nosDeTipo(S);
  const valorDaFamilia = new Map<FamiliaDeDado, number | null>();
  for (const f of FAMILIAS) {
    const m = maximoDaFamilia(S, f);
    valorDaFamilia.set(f, m);
    nos.push({
      id: `familia:${f}`, estagio: "agregacao", rotulo: f,
      valor: m === null ? "sem dado" : fmt(m, 2), ativo: m !== null && m > 0,
    });
  }
  nos.push({
    id: "decisao:sorteio", estagio: "decisao", rotulo: "sorteio ponderado (a³)",
    valor: String(cand.length), ativo: true,
  });

  const ligacoes: LigacaoDoCircuito[] = ligacoesEntradaTipo(S);
  for (const t of TYPES) {
    const s = S[t.id];
    ligacoes.push({ de: `tipo:${t.id}`, para: `familia:${t.fam}`, ativa: s !== null && s > 0, intensidade: s ?? 0 });
  }
  const declaradas = new Set<FamiliaDeDado>();
  for (const x of cand) {
    const obra = catalogo.find((ob) => ob.id === x.id);
    if (obra) for (const f of familiasDaObra(obra)) declaradas.add(f);
  }
  for (const f of FAMILIAS) {
    ligacoes.push({
      de: `familia:${f}`, para: "decisao:sorteio",
      ativa: declaradas.has(f), intensidade: valorDaFamilia.get(f) ?? 0,
    });
  }
  return { nos, ligacoes };
}
