/**
 * Dominante + rodízio: vence o fenômeno mais saliente; dentro do tipo, toca a obra que está
 * há mais tempo sem tocar. Base dos critérios B (escalas fixas) e D (relativo ao lugar).
 * Porte fiel de `dominanteRodizio` do estudo (`tests/fixtures/estudo-criterios.cjs`).
 */
import {
  CALMARIA, LIMIARES, TYPES, TYPE_BY_ID, descreveTipo, fmt, isNum, obrasPorTipo, rankingTipos,
  saliencias, tiposDaObra,
} from "./saliencia";
import type {
  LinhaDoRanking, MapaDeSaliencia, ModoDeSaliencia, ResultadoDeSaliencia, TipoId,
} from "./saliencia";
import type {
  Calculo, Circuito, ContextoDeDecisao, EntradaClima, LigacaoDoCircuito, MemoriaDeRodizio,
  NomeEntrada, NoDoCircuito, ObraDoCatalogo,
} from "./tipos";

export type CandidataDoRodizio = {
  id: ObraDoCatalogo["id"];
  /** Quantas outras entradas da obra também estão salientes (aderência). */
  bonus: number;
  outros: Array<TipoId | "calmaria">;
  /** Tick da última vez que tocou; -Infinity se nunca. */
  last: number;
};

export type ResultadoDoRodizio = {
  S: MapaDeSaliencia;
  sal: ResultadoDeSaliencia;
  ranking: LinhaDoRanking[];
  vencedor: TipoId | "calmaria";
  vencedorLabel: string;
  /** Na ordem do rodízio: a primeira é a escolhida. */
  candidatas: CandidataDoRodizio[];
  escolha: ObraDoCatalogo["id"] | null;
  motivo: string;
  semDado: boolean;
};

export function dominanteRodizio(
  c: EntradaClima,
  catalogo: readonly ObraDoCatalogo[],
  memoria: MemoriaDeRodizio | null,
  opcoes: { modo: ModoDeSaliencia; normal?: ContextoDeDecisao["normal"] },
): ResultadoDoRodizio {
  const L = LIMIARES;
  const sal = saliencias(c, opcoes);
  const S = sal.S;
  const porTipo = obrasPorTipo(catalogo);
  const ranking = rankingTipos(S, porTipo);
  const comObra = ranking.filter((r) => r.obras > 0);
  const semDado = TYPES.every((t) => S[t.id] === null);
  let vencedor: TipoId | "calmaria" =
    comObra.length && comObra[0].s >= L.piso ? comObra[0].id : "calmaria";
  const pulados = ranking.filter(
    (r) => r.obras === 0 && r.s >= L.piso && (vencedor === "calmaria" || r.s > (S[vencedor] as number)),
  );
  const ordem = catalogo.map((ob) => ob.id);
  const byId = new Map(catalogo.map((ob) => [ob.id, ob]));
  const ticks = memoria ? Object.values(memoria).filter(isNum) : [];
  const ultimoTick = ticks.length ? Math.max(...ticks) : null;

  const candidatosDe = (tipo: TipoId | "calmaria"): CandidataDoRodizio[] => {
    const cand = porTipo[tipo].map((oid) => {
      const obra = byId.get(oid) as ObraDoCatalogo;
      const outros = tiposDaObra(obra).filter((t) => {
        if (t === tipo || t === "calmaria") return false;
        const s = S[t];
        return s !== null && s >= L.piso;
      });
      const ultima = memoria?.[oid];
      const last = isNum(ultima) ? ultima : -Infinity;
      return { id: oid, bonus: outros.length, outros, last };
    });
    // -Infinity - -Infinity é NaN (falso): cai no próximo critério, igual ao estudo.
    cand.sort((a, b) => a.last - b.last || b.bonus - a.bonus || ordem.indexOf(a.id) - ordem.indexOf(b.id));
    return cand;
  };

  let cand = candidatosDe(vencedor);
  // Sem repetição imediata: um tipo com uma obra só não toca a mesma obra duas vezes seguidas
  // se houver outro fenômeno acima do piso (ou, na falta dele, uma obra da calmaria).
  let repetiu: { tipo: TipoId; obra: ObraDoCatalogo["id"] } | null = null;
  if (vencedor !== "calmaria" && cand.length === 1 && ultimoTick !== null && cand[0].last === ultimoTick) {
    const prox = comObra.find((r) => r.id !== vencedor && r.s >= L.piso);
    repetiu = { tipo: vencedor, obra: cand[0].id };
    vencedor = prox ? prox.id : "calmaria";
    cand = candidatosDe(vencedor);
  }
  const escolha = cand.length ? cand[0].id : null;

  let motivo: string;
  if (vencedor === "calmaria") {
    motivo = semDado
      ? "O clima não respondeu. Sem dado não há fenômeno, então toca uma obra que não depende de dado meteorológico."
      : `Nenhum fenômeno passa do piso (${fmt(L.piso, 2)}). O tempo está calmo, então toca uma obra sem entrada meteorológica.`;
  } else {
    motivo = `${TYPE_BY_ID[vencedor].label} é o fenômeno mais saliente (${fmt(S[vencedor], 2)}: ${descreveTipo(vencedor, c, sal)}).`;
  }
  if (repetiu) {
    const rl = TYPE_BY_ID[repetiu.tipo].label;
    const aVez = vencedor === "calmaria"
      ? "à Calmaria"
      : `para ${TYPE_BY_ID[vencedor].label} (${fmt(S[vencedor], 2)}: ${descreveTipo(vencedor, c, sal)})`;
    motivo = `${rl} é o fenômeno mais saliente (${fmt(S[repetiu.tipo], 2)}), mas a única obra desse tipo, ${(byId.get(repetiu.obra) as ObraDoCatalogo).label}, acabou de tocar. Para não repetir, a vez passa ${aVez}.`;
  }
  if (pulados.length) {
    motivo += ` ${pulados.map((p) => p.label).join(", ")} estava mais alto, mas nenhuma obra recebe esse dado ainda.`;
  }
  if (escolha) {
    const ce = cand[0];
    const rotuloDaEscolha = (byId.get(escolha) as ObraDoCatalogo).label;
    motivo += cand.length > 1
      ? ` Entre ${cand.length} obras desse tipo, ${rotuloDaEscolha} ${ce.last === -Infinity ? "ainda não tocou" : "é a que tocou há mais tempo"}${ce.bonus ? ` e também recebe ${ce.outros.map((t) => (t === "calmaria" ? "calmaria" : TYPE_BY_ID[t].label.toLowerCase())).join(" e ")}` : ""}.`
      : ` ${rotuloDaEscolha} é a única obra desse tipo.`;
  }

  return {
    S, sal, ranking, vencedor,
    vencedorLabel: vencedor === "calmaria" ? CALMARIA.label : TYPE_BY_ID[vencedor].label,
    candidatas: cand, escolha, motivo, semDado,
  };
}

/** Entradas que alimentam cada tipo (as famílias do estudo). */
const ENTRADAS_DO_TIPO: Readonly<Record<TipoId, readonly NomeEntrada[]>> = {
  raios: ["lightningCount"],
  fogo: ["fireCount", "closeFires"],
  chuva: ["rain"],
  neve: [],
  vento: ["windSpeed"],
  calor: ["temperature"],
  frio: ["temperature"],
  seco: ["humidity"],
  umido: ["humidity"],
  nuvens: ["clouds"],
};

const pt2 = (v: number): string => fmt(v, 2);

/** Circuito: entradas → tipos → ranking → decisão (as obras são acrescentadas pela base). */
function montarCircuito(r: ResultadoDoRodizio): Circuito {
  const piso = LIMIARES.piso;
  const nos: NoDoCircuito[] = TYPES.map((t) => {
    const s = r.S[t.id];
    return {
      id: `tipo:${t.id}`, estagio: "transformacao", rotulo: t.label,
      valor: s === null ? "sem dado" : pt2(s), grupo: t.id, ativo: s !== null && s >= piso,
    };
  });
  nos.push({
    id: "ranking", estagio: "agregacao", rotulo: "maior saliência ≥ piso",
    valor: `piso ${pt2(piso)}`, ativo: true,
  });
  nos.push({
    id: "decisao:rodizio", estagio: "decisao", rotulo: "Rodízio do tipo vencedor",
    valor: r.vencedorLabel, ativo: true,
  });

  const ligacoes: LigacaoDoCircuito[] = [];
  const temObra = (id: TipoId) => r.ranking.some((x) => x.id === id && x.obras > 0);
  for (const t of TYPES) {
    const s = r.S[t.id];
    for (const nome of ENTRADAS_DO_TIPO[t.id]) {
      ligacoes.push({
        de: `entrada:${nome}`, para: `tipo:${t.id}`, ativa: s !== null && s > 0, intensidade: s ?? 0,
      });
    }
  }
  for (const t of TYPES) {
    const s = r.S[t.id];
    ligacoes.push({
      de: `tipo:${t.id}`, para: "ranking", ativa: s !== null && s >= piso && temObra(t.id), intensidade: s ?? 0,
    });
  }
  ligacoes.push({ de: "ranking", para: "decisao:rodizio", ativa: true, intensidade: 1 });
  return { nos, ligacoes };
}

/** Converte o resultado do rodízio no `Calculo` que a base dos critérios espera. */
export function calculoDoRodizio(
  entrada: EntradaClima,
  contexto: ContextoDeDecisao,
  modo: ModoDeSaliencia,
): { calculo: Calculo; resultado: ResultadoDoRodizio } {
  const resultado = dominanteRodizio(entrada, contexto.catalogo, contexto.memoria, {
    modo, normal: contexto.normal,
  });
  const calculo: Calculo = {
    vencedor: { id: resultado.vencedor, rotulo: resultado.vencedorLabel },
    candidatas: resultado.candidatas.map((c, i) => ({
      obra: c.id,
      probabilidade: i === 0 ? 1 : 0,
      nota: c.last === -Infinity ? "nunca tocou" : `tocou no tick ${c.last}`,
    })),
    sorteio: "deterministico",
    motivo: resultado.motivo,
    numeros: { ...resultado.S },
    circuito: montarCircuito(resultado),
  };
  return { calculo, resultado };
}
