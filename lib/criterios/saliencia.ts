/**
 * Saliência: quanto cada fenômeno (raios, fogo, chuva, vento…) "se destaca" no clima, de 0 a 1.
 * Base comum dos critérios B, C e D; porte fiel do kernel do estudo
 * (`tests/fixtures/estudo-criterios.cjs`), com a mesma matemática e a mesma ordem de contas.
 *
 * Diferença deliberada: a entrada do GaiaSenses não tem neve (`snowfall`). O tipo `neve`
 * continua na lista, na ordem do estudo (o desempate depende dela), mas a saliência dele é
 * sempre null.
 */
import type { EntradaClima, NormalDoLugar, ObraDoCatalogo } from "./tipos";

export type TipoId =
  | "raios" | "fogo" | "chuva" | "neve" | "vento" | "calor" | "frio" | "seco" | "umido" | "nuvens";

export type FamiliaDeDado =
  | "raios" | "fogo" | "chuva" | "neve" | "vento" | "temperatura" | "umidade" | "nuvens";

export type Tipo = { id: TipoId; label: string; fam: FamiliaDeDado };

/** Saliência de cada tipo; null = sem dado. */
export type MapaDeSaliencia = Record<TipoId, number | null>;

type Pontos = ReadonlyArray<readonly [number, number]>;

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Interpolação linear por partes; fora da faixa vale o valor da ponta. */
export function lerp(points: Pontos, x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

/** Contagens (raios, focos) crescem em ordens de grandeza: interpola em log10(1+n). */
export function lerpLog(points: Pontos, n: number): number {
  const pts: Array<readonly [number, number]> = points.map(([x, y]) => [Math.log10(1 + x), y]);
  return lerp(pts, Math.log10(1 + Math.max(0, n)));
}

/** Família de dado de cada atributo do vocabulário das obras. lat/lon não são clima. */
export const ATTR_FAMILY: Readonly<Record<string, FamiliaDeDado | null>> = {
  lightningCount: "raios", fireCount: "fogo", closeFires: "fogo", rain: "chuva", snowfall: "neve",
  windSpeed: "vento", windDeg: "vento", temperature: "temperatura", humidity: "umidade",
  clouds: "nuvens", lat: null, lon: null,
};

/** A ordem é a prioridade no empate: o mais raro e mais "evento" primeiro. */
export const TYPES: readonly Tipo[] = [
  { id: "raios", label: "Raios", fam: "raios" },
  { id: "fogo", label: "Fogo", fam: "fogo" },
  { id: "chuva", label: "Chuva", fam: "chuva" },
  { id: "neve", label: "Neve", fam: "neve" },
  { id: "vento", label: "Vento", fam: "vento" },
  { id: "calor", label: "Calor", fam: "temperatura" },
  { id: "frio", label: "Frio", fam: "temperatura" },
  { id: "seco", label: "Seco", fam: "umidade" },
  { id: "umido", label: "Úmido", fam: "umidade" },
  { id: "nuvens", label: "Nuvens", fam: "nuvens" },
];

export const TYPE_BY_ID: Readonly<Record<TipoId, Tipo>> = Object.fromEntries(
  TYPES.map((t) => [t.id, t]),
) as Record<TipoId, Tipo>;

export const CALMARIA = { id: "calmaria", label: "Calmaria" } as const;

/** Familias de dado que a obra declara receber. */
export function familiasDaObra(obra: Pick<ObraDoCatalogo, "attributes">): FamiliaDeDado[] {
  const fams = new Set<FamiliaDeDado>();
  for (const a of obra.attributes) {
    const f = ATTR_FAMILY[a];
    if (f) fams.add(f);
  }
  return [...fams];
}

/** Tipos de uma obra: derivados SÓ das entradas declaradas. Sem nenhuma, é da calmaria. */
export function tiposDaObra(obra: Pick<ObraDoCatalogo, "attributes">): Array<TipoId | "calmaria"> {
  const fams = familiasDaObra(obra);
  const ts = TYPES.filter((t) => fams.includes(t.fam)).map((t) => t.id);
  return ts.length ? ts : ["calmaria"];
}

export const LIMIARES = {
  piso: 0.25,
  chuva: [[0, 0], [0.1, 0.45], [2.5, 0.65], [7.6, 0.85], [20, 1]], // mm/h, classes WMO
  raios: [[0, 0], [1, 0.8], [10, 0.92], [50, 1]], // contagem até 100 km (log)
  fogoLonge: [[0, 0], [1, 0.3], [10, 0.5], [50, 0.65]], // focos até 100 km (log)
  fogoPerto: [[0, 0], [1, 0.6], [5, 0.8], [20, 1]], // focos a menos de 50 km (log)
  calor: [[26, 0], [28, 0.3], [32, 0.6], [38, 1]], // °C
  frio: [[-5, 1], [5, 0.6], [12, 0.3], [14, 0]], // °C
  vento: [[3.4, 0], [5.5, 0.4], [10.8, 0.65], [17.2, 0.85], [24.5, 1]], // m/s, Beaufort 2/4/6/8/10
  nuvens: [[60, 0], [80, 0.15], [100, 0.3]], // %: sinal fraco, nuvem é comum
  seco: [[5, 1], [15, 0.8], [30, 0.4], [35, 0]], // % UR
  umido: [[80, 0], [85, 0.25], [100, 0.4]], // % UR: abaixo de qualquer chuva
  neve: [[0, 0], [0.1, 0.6], [1, 0.85], [3, 1]], // cm/h
  anomalia: [[0.5, 0], [1, 0.35], [2, 0.75], [3, 1]], // |z| contra o normal do lugar
  nuvensAnomaliaTeto: 0.6,
} as const satisfies Record<string, number | Pontos>;

export type ModoDeSaliencia = "abs" | "rel";

export type ResultadoDeSaliencia = {
  S: MapaDeSaliencia;
  /** z-score de cada variável contra o normal; null sem normal ou sem dado. */
  z: { temperatura: number | null; umidade: number | null; nuvens: number | null; vento: number | null };
  /** Quais variáveis foram avaliadas contra o normal ("rel"). */
  fonte: Partial<Record<"temperatura" | "umidade" | "nuvens" | "vento", "rel">>;
};

/**
 * Saliência 0..1 de cada tipo; null = sem dado.
 * Modo "abs": escalas meteorológicas fixas. Modo "rel": temperatura, umidade, nuvens e vento
 * contra o normal do lugar (z-score); chuva, raio e fogo continuam absolutos, porque são eventos.
 */
export function saliencias(
  c: EntradaClima,
  opcoes: { modo?: ModoDeSaliencia; normal?: NormalDoLugar | null } = {},
): ResultadoDeSaliencia {
  const L = LIMIARES;
  const N = opcoes.modo === "rel" ? (opcoes.normal ?? null) : null;
  const S = {} as MapaDeSaliencia;
  const fonte: ResultadoDeSaliencia["fonte"] = {};

  S.raios = isNum(c.lightningCount) ? lerpLog(L.raios, c.lightningCount) : null;
  S.fogo = isNum(c.fireCount)
    ? Math.max(lerpLog(L.fogoLonge, c.fireCount), lerpLog(L.fogoPerto, isNum(c.closeFires) ? c.closeFires : 0))
    : null;
  S.chuva = isNum(c.rain) ? lerp(L.chuva, c.rain) : null;
  S.neve = null; // a entrada do GaiaSenses não traz neve

  const z = (v: number | null, k: "temperature" | "humidity" | "clouds" | "windSpeed"): number | null => {
    const n = N?.[k];
    if (!N || !n || !isNum(v)) return null;
    return (v - n.mu) / Math.max(n.sd, k === "temperature" ? 0.8 : k === "windSpeed" ? 0.5 : 3);
  };
  const zt = z(c.temperature, "temperature");
  const zh = z(c.humidity, "humidity");
  const zc = z(c.clouds, "clouds");
  const zw = z(c.windSpeed, "windSpeed");

  if (!isNum(c.temperature)) { S.calor = null; S.frio = null; }
  else if (zt !== null) {
    S.calor = lerp(L.anomalia, zt); S.frio = lerp(L.anomalia, -zt); fonte.temperatura = "rel";
  } else { S.calor = lerp(L.calor, c.temperature); S.frio = lerp(L.frio, c.temperature); }

  if (!isNum(c.humidity)) { S.seco = null; S.umido = null; }
  else if (zh !== null) {
    S.seco = lerp(L.anomalia, -zh); S.umido = lerp(L.anomalia, zh); fonte.umidade = "rel";
  } else { S.seco = lerp(L.seco, c.humidity); S.umido = lerp(L.umido, c.humidity); }

  if (!isNum(c.windSpeed)) S.vento = null;
  else if (zw !== null) { S.vento = lerp(L.anomalia, zw); fonte.vento = "rel"; }
  else S.vento = lerp(L.vento, c.windSpeed);

  if (!isNum(c.clouds)) S.nuvens = null;
  else if (zc !== null) {
    S.nuvens = Math.min(L.nuvensAnomaliaTeto, lerp(L.anomalia, zc)); fonte.nuvens = "rel";
  } else S.nuvens = lerp(L.nuvens, c.clouds);

  // O estudo ainda multiplica por um peso por tipo (padrão 1); aqui o peso é sempre 1.
  return { S, z: { temperatura: zt, umidade: zh, nuvens: zc, vento: zw }, fonte };
}

const BEAUFORT: ReadonlyArray<readonly [number, number, string]> = [
  [0.3, 0, "calmaria"], [1.6, 1, "aragem"], [3.4, 2, "brisa leve"], [5.5, 3, "brisa fraca"],
  [8.0, 4, "brisa moderada"], [10.8, 5, "brisa forte"], [13.9, 6, "vento fresco"],
  [17.2, 7, "vento forte"], [20.8, 8, "ventania"], [24.5, 9, "ventania forte"],
  [28.5, 10, "tempestade"], [32.7, 11, "tempestade violenta"], [Infinity, 12, "furacão"],
];

export function beaufort(ms: number): { n: number; nome: string } {
  for (const [lim, n, nome] of BEAUFORT) if (ms < lim) return { n, nome };
  return { n: 12, nome: "furacão" };
}

/** Número com vírgula decimal; "—" sem dado. */
export const fmt = (v: number | null | undefined, d = 1): string =>
  (isNum(v) ? v.toFixed(d).replace(".", ",") : "—");

/** Frase que descreve o fenômeno com os números do clima, para o `motivo`. */
export function descreveTipo(tipo: TipoId, c: EntradaClima, sal?: ResultadoDeSaliencia): string {
  const zt = sal?.z;
  const rain = c.rain as number;
  const vento = c.windSpeed as number;
  switch (tipo) {
    case "raios": return `${c.lightningCount} raio${c.lightningCount === 1 ? "" : "s"} a até 100 km`;
    case "fogo":
      return `${c.fireCount} foco${c.fireCount === 1 ? "" : "s"} a até 100 km, ${c.closeFires || 0} a menos de 50 km`;
    case "chuva": {
      const cl = rain < 2.5 ? "fraca" : rain < 7.6 ? "moderada" : "forte";
      return `${fmt(c.rain)} mm/h, chuva ${cl} (WMO)`;
    }
    case "neve": return `${fmt(null)} cm/h de neve`;
    case "vento": {
      const b = beaufort(vento);
      const rel = zt && zt.vento !== null && sal?.fonte.vento ? `, ${fmt(zt.vento)} desvios acima do normal` : "";
      return `${fmt(vento)} m/s (${fmt(vento * 3.6, 0)} km/h), Beaufort ${b.n}, ${b.nome}${rel}`;
    }
    case "calor": case "frio": {
      const rel = zt && zt.temperatura !== null && sal?.fonte.temperatura
        ? `, ${fmt(Math.abs(zt.temperatura))} desvios ${zt.temperatura >= 0 ? "acima" : "abaixo"} do normal do lugar`
        : "";
      return `${fmt(c.temperature)} °C${rel}`;
    }
    case "seco": case "umido": {
      const rel = zt && zt.umidade !== null && sal?.fonte.umidade
        ? `, ${fmt(Math.abs(zt.umidade))} desvios ${zt.umidade >= 0 ? "acima" : "abaixo"} do normal`
        : "";
      return `umidade ${fmt(c.humidity, 0)}%${rel}`;
    }
    case "nuvens": return `${fmt(c.clouds, 0)}% de céu coberto`;
    default: return "";
  }
}

export type ObrasPorTipo = Record<TipoId | "calmaria", Array<ObraDoCatalogo["id"]>>;

/** Obras do catálogo agrupadas por tipo (na ordem do catálogo). */
export function obrasPorTipo(catalogo: readonly ObraDoCatalogo[]): ObrasPorTipo {
  const m = { calmaria: [] } as unknown as ObrasPorTipo;
  for (const t of TYPES) m[t.id] = [];
  for (const obra of catalogo) for (const t of tiposDaObra(obra)) m[t].push(obra.id);
  return m;
}

export type LinhaDoRanking = { id: TipoId; label: string; s: number; obras: number; prio: number };

/** Tipos com dado, do mais ao menos saliente; empate pela ordem de `TYPES`. */
export function rankingTipos(S: MapaDeSaliencia, porTipo: ObrasPorTipo): LinhaDoRanking[] {
  return TYPES.filter((t) => S[t.id] !== null)
    .map((t) => ({
      id: t.id, label: t.label, s: S[t.id] as number, obras: porTipo[t.id].length, prio: TYPES.indexOf(t),
    }))
    .sort((a, b) => b.s - a.s || a.prio - b.prio);
}
