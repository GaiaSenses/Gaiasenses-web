/**
 * Apresentação do simulador: textos, números em pt-BR, cores dos LEDs e o caminho do pulso.
 * Lógica pura (sem React), para os testes cobrirem o que a interface mostra.
 */
import type { Circuito, IdCriterio, ResultadoDaComparacao, ResultadoDeDecisao } from "@/lib/criterios/tipos";
import { ENTRADAS, PRESETS, entradasSemFonte, lerCenario, type Cenario } from "./cenario";
import type { Selecao } from "./selecao";

/** O "0" do critério atual, como no estudo; os outros já são uma letra. */
export function idCurto(id: IdCriterio): string {
  return id === "atual" ? "0" : id;
}

/**
 * O rótulo que a interface mostra: o id curto e o nome ("0 · Atual", "B · Dominante + rodízio").
 * O `nome` do critério é só o nome; o prefixo é coisa da tela.
 */
export function rotuloDoCriterio(c: { id: IdCriterio; nome: string }): string {
  return `${idCurto(c.id)} · ${c.nome}`;
}

export function formatarMs(ms: number): string {
  return `${ms.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ms`;
}

export function formatarProbabilidade(p: number): string {
  if (p > 0 && p < 0.005) return "<1%";
  return p.toLocaleString("pt-BR", { style: "percent", maximumFractionDigits: 0 });
}

export type ComoFoiEscolhida =
  | { tipo: "rodizio" }
  | { tipo: "sorteio"; probabilidade: number }
  | { tipo: "manual" }
  | { tipo: "nenhuma" };

export function comoFoiEscolhida(r: ResultadoDeDecisao, s: Selecao | undefined): ComoFoiEscolhida {
  if (!s?.obra) return { tipo: "nenhuma" };
  if (s.origem === "manual") return { tipo: "manual" };
  if (r.sorteio === "deterministico") return { tipo: "rodizio" };
  const c = r.candidatas.find((x) => x.obra === s.obra);
  return { tipo: "sorteio", probabilidade: c?.probabilidade ?? 0 };
}

/** O selo curto da coluna "obra": "rodízio", "34%" ou "à mão". */
export function seloDaEscolha(como: ComoFoiEscolhida): string {
  switch (como.tipo) {
    case "rodizio":
      return "rodízio";
    case "sorteio":
      return formatarProbabilidade(como.probabilidade);
    case "manual":
      return "à mão";
    case "nenhuma":
      return "";
  }
}

/** De onde veio a obra do módulo: "por sorteio", "por rodízio" ou "à mão" (null sem obra). */
export function origemDaEscolha(como: ComoFoiEscolhida): string | null {
  switch (como.tipo) {
    case "sorteio":
      return "por sorteio";
    case "rodizio":
      return "por rodízio";
    case "manual":
      return "à mão";
    case "nenhuma":
      return null;
  }
}

/** O texto do `aria-live`: muda só quando muda o foco, o vencedor ou a obra (não a cada valor). */
export function resumoDoFoco(
  rc: ResultadoDaComparacao | undefined,
  s: Selecao | undefined,
  rotuloDaObra: (id: string) => string,
): string {
  if (!rc) return "";
  const inicio = `Critério em foco: ${rotuloDoCriterio(rc.criterio)}.`;
  if (!rc.ok) return `${inicio} O critério falhou: ${rc.erro}`;
  const r = rc.resultado;
  const vencedor = ` Vencedor: ${r.vencedor.rotulo}.`;
  const como = comoFoiEscolhida(r, s);
  if (como.tipo === "nenhuma" || !s?.obra) return `${inicio}${vencedor} Nenhuma obra candidata.`;
  const obra = rotuloDaObra(s.obra);
  const modo =
    como.tipo === "manual"
      ? "escolhida à mão"
      : como.tipo === "rodizio"
        ? "por rodízio"
        : `por sorteio, ${formatarProbabilidade(como.probabilidade)}`;
  return `${inicio}${vencedor} Obra: ${obra}, ${modo}.`;
}

/** Casas decimais de um passo de slider (0,5 → 1; 0,01 → 2; 5 → 0). */
export function casasDecimais(passo: number): number {
  const texto = String(passo);
  const ponto = texto.indexOf(".");
  return ponto < 0 ? 0 : texto.length - ponto - 1;
}

/** Valor de entrada em pt-BR, sem separador de milhar, com no máximo as casas do passo. */
export function formatarValor(v: number, passo: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: casasDecimais(passo), useGrouping: false });
}

/** Lê um número digitado em pt-BR ("-23,5") ou com ponto; null se não for um número. */
export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (limpo === "" || limpo === "-" || limpo === ".") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Tira o ruído de ponto flutuante do slider (0,30000000000000004 → 0,3). */
export function arredondarAoPasso(v: number, passo: number): number {
  const casas = casasDecimais(passo);
  return Number((Math.round(v / passo) * passo).toFixed(casas));
}

/**
 * O valor que uma entrada aceita: dentro da faixa e no passo dela. Vale para o slider e para o
 * número digitado, para a tela (que mostra as casas do passo) e o critério verem o mesmo valor:
 * "0,4" raio vira 0, e não um 0,4 que acende a regra "raios > 0" com o display mostrando 0.
 */
export function ajustarAoPasso(v: number, min: number, max: number, passo: number): number {
  const limitar = (n: number) => Math.min(max, Math.max(min, n));
  return limitar(arredondarAoPasso(limitar(v), passo));
}

/** Parâmetros que o middleware injeta em toda URL (lat/lng do IP e o modo do mapa). */
const DO_MIDDLEWARE = ["lat", "lng", "mode"] as const;

/**
 * O cenário com que a página abre e os parâmetros da URL a manter (D3.2: "a URL manda").
 * - Veio da URL (algum atributo além do lat/lng do middleware): vale o cenário dela, com cada
 *   valor no passo da entrada.
 * - Não veio: é o preset "Dia limpo" inteiro, e lat, lng e mode saem da URL. Senão a posição
 *   do IP de quem pesquisa (dado pessoal) entraria no cenário e no link copiado.
 * O `mode` do mapa nunca é do simulador, então sai sempre.
 */
export function cenarioInicial(p: URLSearchParams): { cenario: Cenario; params: URLSearchParams } {
  const { cenario: lido, veioDaUrl } = lerCenario(p);
  const params = new URLSearchParams(p);
  params.delete("mode");
  if (!veioDaUrl) {
    for (const k of DO_MIDDLEWARE) params.delete(k);
    return { cenario: PRESETS[0].cenario, params };
  }
  const valores = { ...lido.valores };
  for (const e of ENTRADAS) valores[e.nome] = arredondarAoPasso(valores[e.nome], e.passo);
  return { cenario: { ...lido, valores }, params };
}

/** Cor do LED pelo grupo do fenômeno (D4); null para quem não tem grupo na tabela. */
const CORES_DOS_LEDS: Readonly<Record<string, string>> = {
  atmosphere: "#7CD6EA",
  vento: "#7CD6EA",
  nuvens: "#7CD6EA",
  fulmen: "#B9A2FF",
  raios: "#B9A2FF",
  pyro: "#FF6B3D",
  fogo: "#FF6B3D",
  calor: "#FF6B3D",
  hydros: "#4AA3FF",
  chuva: "#4AA3FF",
  umido: "#4AA3FF",
  seco: "#F2C14E",
  frio: "#F2C14E",
  entropy: "#F1E6C8",
  calmaria: "#F1E6C8",
};

export function corDoGrupo(grupo: string | null | undefined): string | null {
  return (grupo && CORES_DOS_LEDS[grupo]) || null;
}

/** A legenda dos LEDs, na ordem da tabela da D4. */
export const LEGENDA_DOS_LEDS: readonly { cor: string; texto: string }[] = [
  { cor: "#7CD6EA", texto: "atmosfera, vento, nuvens" },
  { cor: "#B9A2FF", texto: "raios" },
  { cor: "#FF6B3D", texto: "fogo, calor" },
  { cor: "#4AA3FF", texto: "chuva, úmido" },
  { cor: "#F2C14E", texto: "seco, frio" },
  { cor: "#F1E6C8", texto: "lugar, calmaria" },
];

/**
 * O circuito com o destaque na obra selecionada (que pode ser a da URL, a mantida pelo sorteio ou a
 * escolhida à mão), e não na `escolha` crua da última avaliação: a placa mostra o que vai tocar.
 */
export function comDestaque(c: Circuito, obra: string | null): Circuito {
  const alvo = obra ? `obra:${obra}` : null;
  return {
    ...c,
    nos: c.nos.map((n) => {
      if (n.estagio !== "obra") return n;
      const { destaque: _antigo, ...resto } = n;
      return n.id === alvo ? { ...resto, destaque: true } : resto;
    }),
  };
}

const ETAPAS = ["entrada", "transformacao", "agregacao", "decisao", "obra"] as const;

/**
 * O caminho por onde passa o pulso quando a escolha muda: as trilhas energizadas que levam até a
 * obra em destaque, de trás para a frente, mais a da obra até o J1. `etapa` é a coluna de onde a
 * trilha sai (0 = entradas), para o pulso andar da esquerda para a direita.
 */
export function caminhoDaEscolha(
  trilhas: readonly { id: string; de: string; para: string; ativa: boolean; direta?: boolean }[],
  nos: readonly { id: string; estagio: (typeof ETAPAS)[number] }[],
  obraNoId: string | null,
): { id: string; etapa: number }[] {
  if (!obraNoId) return [];
  const etapaDe = new Map(nos.map((n) => [n.id, ETAPAS.indexOf(n.estagio)]));
  const alcancados = new Set([obraNoId]);
  const noCaminho = new Set<string>();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const t of trilhas) {
      if (!t.ativa || t.direta || noCaminho.has(t.id) || !alcancados.has(t.para)) continue;
      noCaminho.add(t.id);
      alcancados.add(t.de);
      mudou = true;
    }
  }
  for (const t of trilhas) if (t.de === obraNoId && t.para === "j1") noCaminho.add(t.id);
  return trilhas
    .filter((t) => noCaminho.has(t.id))
    .map((t) => ({ id: t.id, etapa: etapaDe.get(t.de) ?? 0 }));
}

/**
 * O preset de que o cenário não se afastou, ou null. O foco não conta, nem os valores que um
 * interruptor ligado tira do ar: a URL os leva como 0, e o "API do clima caiu" lido de um link
 * continua sendo ele.
 */
export function presetDoCenario(c: Cenario): string | null {
  const semFonte = entradasSemFonte(c);
  const igual = (p: Cenario) =>
    p.climaIndisponivel === c.climaIndisponivel &&
    p.sateliteIndisponivel === c.sateliteIndisponivel &&
    p.normalRef.cidade === c.normalRef.cidade &&
    p.normalRef.mes === c.normalRef.mes &&
    p.normalRef.periodo === c.normalRef.periodo &&
    (Object.keys(p.valores) as (keyof Cenario["valores"])[]).every(
      (k) => semFonte.includes(k) || p.valores[k] === c.valores[k],
    );
  return PRESETS.find((p) => igual(p.cenario))?.id ?? null;
}

/** Quebra um rótulo em linhas de até `max` caracteres, pelas palavras (uma palavra longa fica inteira). */
export function quebrarEmLinhas(texto: string, max: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    if (atual && atual.length + 1 + palavra.length > max) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = atual ? `${atual} ${palavra}` : palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/**
 * Separa o número do valor de um nó para o display de 7 segmentos: "42,5" → número; "25,0 (piso)"
 * → número e resto "piso"; "> 0 → +90" ou "sem dado" → só texto.
 */
export function partirValor(valor: string): { numero: string | null; resto: string | null } {
  const m = /^(-?\d+(?:[.,]\d+)?)(?:\s+\((.+)\))?$/.exec(valor.trim());
  if (!m) return { numero: null, resto: valor };
  return { numero: m[1], resto: m[2] ?? null };
}
