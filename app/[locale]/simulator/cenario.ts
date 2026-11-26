/**
 * Modelo do cenário do simulador: as entradas que o pesquisador mexe, guardadas na URL.
 * Lógica pura (sem React) para os testes cobrirem a ida e volta.
 */
import { COMPOSITION_ATTRIBUTES } from "@/lib/gaia-composition-attributes.generated";
import type { EntradaClima, IdCriterio, NomeEntrada } from "@/lib/criterios/tipos";

export type Cenario = {
  valores: Record<NomeEntrada, number>;
  climaIndisponivel: boolean;
  sateliteIndisponivel: boolean;
  normalRef: { cidade: string; mes: number; periodo: "dia" | "noite" };
  foco: IdCriterio;
};

type Atributo = { label: string; unit: string; range: readonly number[] };
const ATRIBUTOS = COMPOSITION_ATTRIBUTES as unknown as Record<string, Atributo>;

function entrada(
  nome: NomeEntrada,
  passo: number,
  grupo: "criterio" | "obra",
): { nome: NomeEntrada; rotulo: string; unidade: string; faixa: [number, number]; passo: number; grupo: "criterio" | "obra" } {
  const a = ATRIBUTOS[nome];
  return { nome, rotulo: a.label, unidade: a.unit, faixa: [a.range[0], a.range[1]], passo, grupo };
}

/** closeFires fica em "criterio": o controle dele mora ao lado de fireCount. */
export const ENTRADAS = [
  entrada("temperature", 0.5, "criterio"),
  entrada("humidity", 1, "criterio"),
  entrada("clouds", 1, "criterio"),
  entrada("rain", 0.1, "criterio"),
  entrada("windSpeed", 0.1, "criterio"),
  entrada("lightningCount", 1, "criterio"),
  entrada("fireCount", 1, "criterio"),
  entrada("closeFires", 1, "criterio"),
  entrada("windDeg", 5, "obra"),
  entrada("lat", 0.01, "obra"),
  entrada("lon", 0.01, "obra"),
] as const;

const BASE = { windDeg: 90, lightningCount: 0, fireCount: 0, closeFires: 0, lat: -23.55, lon: -46.66 };

function preset(
  id: string,
  nome: string,
  v: Partial<Record<NomeEntrada, number>> & Pick<Record<NomeEntrada, number>, "temperature" | "humidity" | "clouds" | "rain" | "windSpeed">,
  cidade: string,
  mes: number,
  caiu = false,
): { id: string; nome: string; cenario: Cenario } {
  return {
    id,
    nome,
    cenario: {
      valores: { ...BASE, ...v },
      climaIndisponivel: caiu,
      sateliteIndisponivel: false,
      normalRef: { cidade, mes, periodo: "dia" },
      foco: "atual",
    },
  };
}

// Os 10 presets do estudo. As coordenadas são as de São Paulo em todos (o estudo não as traz).
export const PRESETS: readonly { id: string; nome: string; cenario: Cenario }[] = [
  preset("limpo", "Dia limpo", { temperature: 25, humidity: 70, clouds: 20, rain: 0, windSpeed: 1 }, "São Paulo", 11),
  preset("p1", "Parecer P1: raio com vento", { temperature: 25, humidity: 70, clouds: 90, rain: 2, windSpeed: 4.4, windDeg: 200, lightningCount: 3 }, "Salvador", 11),
  preset("temporal", "Temporal de verão em Campinas", { temperature: 27, humidity: 88, clouds: 100, rain: 18, windSpeed: 7, windDeg: 300, lightningCount: 40 }, "Campinas", 1),
  preset("queimada", "Queimada no cerrado", { temperature: 36, humidity: 15, clouds: 5, rain: 0, windSpeed: 4, windDeg: 70, fireCount: 60, closeFires: 14 }, "Cuiabá", 9),
  preset("calor", "Calor em Cuiabá", { temperature: 40, humidity: 22, clouds: 10, rain: 0, windSpeed: 2 }, "Cuiabá", 10),
  preset("belem", "Chuva forte em Belém", { temperature: 26, humidity: 96, clouds: 100, rain: 15, windSpeed: 3, windDeg: 60 }, "Belém", 3),
  preset("ciclone", "Ciclone no Sul", { temperature: 14, humidity: 85, clouds: 100, rain: 4, windSpeed: 22, windDeg: 200 }, "Porto Alegre", 7),
  preset("ulan", "Inverno em Ulan Bator", { temperature: -18, humidity: 72, clouds: 30, rain: 0, windSpeed: 2, windDeg: 300 }, "Ulan Bator", 1),
  preset("oslo", "Novembro morno em Oslo", { temperature: 15, humidity: 70, clouds: 60, rain: 0, windSpeed: 3, windDeg: 200 }, "Oslo", 11),
  preset("caiu", "API do clima caiu", { temperature: 25, humidity: 70, clouds: 20, rain: 0, windSpeed: 1 }, "São Paulo", 11, true),
];

const PADRAO: Cenario = PRESETS[0].cenario;

const CRITERIOS: readonly IdCriterio[] = ["atual", "A", "B", "C", "D"];
const NOMES_DE_ENTRADA = ENTRADAS.map((e) => e.nome);
// Qualquer um destes na URL (exceto lat/lng/lon, que o middleware injeta) conta como "veio da URL".
const CHAVES_DE_ATRIBUTO = NOMES_DE_ENTRADA.filter((n) => n !== "lat" && n !== "lon");
const CHAVES_DE_ESTADO = ["clima", "satelite", "ref", "mes", "periodo", "foco"];

function limitar(n: number, [min, max]: [number, number]): number {
  return Math.min(max, Math.max(min, n));
}

function numeroDe(texto: string | null): number | null {
  if (texto === null || texto.trim() === "") return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

export function lerCenario(p: URLSearchParams): { cenario: Cenario; veioDaUrl: boolean } {
  const valores = { ...PADRAO.valores };
  for (const e of ENTRADAS) {
    // lon também pode vir como lng (injetado pelo middleware).
    const bruto = e.nome === "lon" ? (p.get("lon") ?? p.get("lng")) : p.get(e.nome);
    const n = numeroDe(bruto);
    if (n !== null) valores[e.nome] = limitar(n, e.faixa);
  }
  valores.closeFires = Math.min(valores.closeFires, valores.fireCount);

  const mesBruto = numeroDe(p.get("mes"));
  const mes = mesBruto === null ? PADRAO.normalRef.mes : limitar(Math.round(mesBruto), [1, 12]);
  const periodo = p.get("periodo") === "noite" ? "noite" : p.get("periodo") === "dia" ? "dia" : PADRAO.normalRef.periodo;
  const foco = CRITERIOS.find((c) => c === p.get("foco")) ?? PADRAO.foco;

  const cenario: Cenario = {
    valores,
    climaIndisponivel: p.get("clima") === "0",
    sateliteIndisponivel: p.get("satelite") === "0",
    normalRef: { cidade: p.get("ref") || PADRAO.normalRef.cidade, mes, periodo },
    foco,
  };
  const veioDaUrl =
    CHAVES_DE_ATRIBUTO.some((k) => p.has(k)) || CHAVES_DE_ESTADO.some((k) => p.has(k));
  return { cenario, veioDaUrl };
}

export function escreverCenario(p: URLSearchParams, c: Cenario): URLSearchParams {
  const saida = new URLSearchParams(p);
  saida.delete("play");
  for (const e of ENTRADAS) saida.set(e.nome, String(c.valores[e.nome]));
  saida.set("lng", String(c.valores.lon));
  if (c.climaIndisponivel) saida.set("clima", "0");
  else saida.delete("clima");
  if (c.sateliteIndisponivel) saida.set("satelite", "0");
  else saida.delete("satelite");
  saida.set("ref", c.normalRef.cidade);
  saida.set("mes", String(c.normalRef.mes));
  saida.set("periodo", c.normalRef.periodo);
  saida.set("foco", c.foco);
  return saida;
}

const DO_CLIMA: readonly NomeEntrada[] = ["temperature", "humidity", "clouds", "rain", "windSpeed", "windDeg"];
const DO_SATELITE: readonly NomeEntrada[] = ["lightningCount", "fireCount", "closeFires"];

/** A entrada que os critérios enxergam: fonte indisponível vira null; closeFires nunca passa de fireCount. */
export function entradaEfetiva(c: Cenario): EntradaClima {
  const e: EntradaClima = { ...c.valores };
  if (c.climaIndisponivel) for (const n of DO_CLIMA) e[n] = null;
  if (c.sateliteIndisponivel) for (const n of DO_SATELITE) e[n] = null;
  if (e.closeFires !== null && e.fireCount !== null) e.closeFires = Math.min(e.closeFires, e.fireCount);
  return e;
}

/** Os valores que a obra recebe como props: só os atributos que ela declara e que o cenário tem. */
export function paraPropsDaObra(c: Cenario, atributos: readonly string[]): Record<string, number> {
  const e = entradaEfetiva(c);
  const props: Record<string, number> = {};
  for (const a of atributos) {
    const v = (e as Record<string, number | null>)[a];
    if (typeof v === "number") props[a] = v;
  }
  return props;
}

