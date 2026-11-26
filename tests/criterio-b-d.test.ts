/**
 * Critérios B (dominante + rodízio) e D (relativo ao lugar): equivalência com o estudo.
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { CriterioB } from "../lib/criterios/criterio-b";
import { CriterioD } from "../lib/criterios/criterio-d";
import { catalogoHabilitado } from "../lib/criterios/catalogo";
import { normalDe, CIDADES_DO_ESTUDO } from "../lib/criterios/normais-do-estudo";
import type {
  ContextoDeDecisao, EntradaClima, MemoriaDeRodizio, NormalDoLugar, ObraDoCatalogo,
} from "../lib/criterios/tipos";
import estudo from "./fixtures/estudo-criterios.cjs";
import dados from "./fixtures/estudo-dados.cjs";

const B = new CriterioB();
const D = new CriterioD();
const catalogo = catalogoHabilitado();

const entrada = (parcial: Partial<EntradaClima> = {}): EntradaClima => ({
  temperature: 25, humidity: 70, clouds: 20, rain: 0, windSpeed: 3, windDeg: 90,
  lightningCount: 0, fireCount: 0, closeFires: 0, lat: 0, lon: 0,
  ...parcial,
});

const contexto = (
  memoria: MemoriaDeRodizio = {}, normal: NormalDoLugar | null = null,
  cat: readonly ObraDoCatalogo[] = catalogo,
): ContextoDeDecisao => ({ catalogo: cat, memoria, normal, sortear: () => 0 });

const paraOEstudo = (e: EntradaClima) => ({ ...e, snowfall: null });

function mulberry32(semente: number): () => number {
  let a = semente;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function climaAleatorio(rng: () => number): EntradaClima {
  const campo = (max: number, min = 0): number | null =>
    rng() < 0.05 ? null : min + rng() * (max - min);
  const contagem = (): number | null =>
    rng() < 0.05 ? null : (rng() < 0.7 ? 0 : Math.floor(rng() * 60));
  return entrada({
    temperature: campo(50, -20), humidity: campo(100), clouds: campo(100),
    rain: rng() < 0.4 ? 0 : campo(25), windSpeed: campo(30), windDeg: campo(360),
    lightningCount: contagem(), fireCount: contagem(), closeFires: contagem(),
  });
}

function igual(novo: { vencedor: { id: string }; escolha: string | null; numeros: Record<string, number | null> },
  velho: { vencedor: string; escolha: string | null; S: object }, rotulo: string) {
  const S = velho.S as Record<string, number | null>;
  assert.equal(novo.vencedor.id, velho.vencedor, `vencedor ${rotulo}`);
  assert.equal(novo.escolha, velho.escolha, `escolha ${rotulo}`);
  for (const k of Object.keys(S)) {
    assert.ok(Object.is(novo.numeros[k], S[k]), `S.${k} ${rotulo}`);
  }
}

describe("catálogo", () => {
  test("a ordem do catálogo habilitado é a do estudo", () => {
    assert.deepEqual(catalogo.map((o) => o.id), dados.catalogo.map((o: { id: string }) => o.id));
  });
});

describe("Critério B · equivalência com o estudo", () => {
  test("B equivale ao estudo em 3000 climas", () => {
    const rng = mulberry32(20261128);
    for (let i = 0; i < 3000; i++) {
      const e = climaAleatorio(rng);
      igual(B.avaliar(e, contexto()), estudo.criterioB(paraOEstudo(e), catalogo, {}), `#${i}`);
    }
  });

  test("B equivale ao estudo numa sequência de 60 escolhas com memória", () => {
    const rng = mulberry32(777);
    const memNova: Record<string, number> = {};
    const memVelha: Record<string, number> = {};
    for (let i = 0; i < 60; i++) {
      const e = climaAleatorio(rng);
      const novo = B.avaliar(e, contexto({ ...memNova }));
      const velho = estudo.criterioB(paraOEstudo(e), catalogo, { ...memVelha });
      igual(novo, velho, `passo ${i}`);
      assert.equal(novo.motivo, velho.motivo, `motivo passo ${i}`);
      if (novo.escolha) memNova[novo.escolha] = i;
      if (velho.escolha) memVelha[velho.escolha] = i;
    }
  });

  test("o motivo e as candidatas seguem o estudo", () => {
    const e = entrada({ rain: 5 });
    const novo = B.avaliar(e, contexto());
    const velho = estudo.criterioB(paraOEstudo(e), catalogo, {});
    assert.equal(novo.motivo, velho.motivo);
    assert.deepEqual(novo.candidatas.map((c) => c.obra), velho.candidatas.map((c: { id: string }) => c.id));
    assert.equal(novo.candidatas[0].probabilidade, 1);
    assert.ok(novo.candidatas.slice(1).every((c) => c.probabilidade === 0));
    assert.equal(novo.candidatas[0].nota, "nunca tocou");
  });
});

describe("Critério D · equivalência com o estudo", () => {
  const casos: Array<[string, number, "dia" | "noite", Partial<EntradaClima>]> = [
    ["São Paulo", 11, "dia", { temperature: 33, humidity: 40, clouds: 90, windSpeed: 7 }],
    ["Ulan Bator", 1, "noite", { temperature: -30, humidity: 60, clouds: 10, windSpeed: 1 }],
  ];
  for (const [cidade, mes, periodo, base] of casos) {
    test(`D equivale ao estudo com o normal de ${cidade}/${mes}/${periodo === "dia" ? 15 : 3} h`, () => {
      const normal = normalDe(cidade, mes, periodo);
      assert.ok(normal, "normal existe");
      const rng = mulberry32(mes * 31);
      const memNova: Record<string, number> = {};
      const memVelha: Record<string, number> = {};
      for (let i = 0; i < 500; i++) {
        const e = i === 0 ? entrada(base) : climaAleatorio(rng);
        const novo = D.avaliar(e, contexto({ ...memNova }, normal));
        const velho = estudo.criterioD(paraOEstudo(e), catalogo, { ...memVelha }, { normal });
        igual(novo, velho, `${cidade} #${i}`);
        assert.equal(novo.motivo, velho.motivo, `motivo ${cidade} #${i}`);
        if (novo.escolha) memNova[novo.escolha] = i;
        if (velho.escolha) memVelha[velho.escolha] = i;
      }
    });
  }

  test("D sem normal = B (o motivo avisa)", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const e = climaAleatorio(rng);
      const d = D.avaliar(e, contexto());
      const b = B.avaliar(e, contexto());
      assert.equal(d.escolha, b.escolha);
      assert.equal(d.vencedor.id, b.vencedor.id);
      assert.equal(d.motivo, `${b.motivo} Sem normal do lugar: igual ao B.`);
    }
  });
});

describe("normais do estudo", () => {
  test("40 cidades e conversão como o toNormal do estudo", () => {
    assert.equal(CIDADES_DO_ESTUDO.length, 40);
    const n = normalDe("São Paulo", 11, "dia");
    assert.ok(n?.temperature && n.temperature.sd > 0);
    assert.equal(normalDe("Atlântida", 1, "dia"), null);
    assert.equal(normalDe("São Paulo", 13, "dia"), null);
  });
});

describe("cenários do estudo", () => {
  const b = { temperature: 25, humidity: 70, clouds: 20, rain: 0, windSpeed: 3, windDeg: 90, lightningCount: 0, fireCount: 0, closeFires: 0 };
  const casos: Array<[string, Partial<EntradaClima>, string]> = [
    ["P1 como escrito", { ...b, lightningCount: 3, windSpeed: 16, clouds: 90, rain: 2 }, "raios"],
    ["P1 como antes do PR #243", { ...b, lightningCount: 3, windSpeed: 4.4, clouds: 90, rain: 2 }, "raios"],
    ["Dia limpo", b, "calmaria"],
    ["Ulan Bator", { ...b, temperature: -10.6, humidity: 79, clouds: 100, windSpeed: 1.4 }, "frio"],
    ["Queimada", { ...b, temperature: 33, humidity: 20, fireCount: 40, closeFires: 12 }, "fogo"],
    ["Chuva forte", { ...b, temperature: 26, humidity: 95, clouds: 100, rain: 12 }, "chuva"],
    ["Calor de 39 °C", { ...b, temperature: 39, humidity: 25, windSpeed: 2 }, "calor"],
    ["Fontes fora do ar", Object.fromEntries(Object.keys(b).map((k) => [k, null])), "calmaria"],
  ];
  for (const [nome, clima, esperado] of casos) {
    test(`${nome} → ${esperado}`, () => {
      const r = B.avaliar(entrada(clima), contexto());
      assert.equal(r.vencedor.id, esperado);
    });
  }
});

describe("regras do rodízio", () => {
  test("sem repetição imediata: um tipo com uma obra só que acabou de tocar passa a vez", () => {
    const cat: ObraDoCatalogo[] = [
      { id: "attractor", label: "Attractor", attributes: ["lightningCount"] },
      { id: "lluvia", label: "Lluvia", attributes: ["rain"] },
      { id: "airports", label: "Airports", attributes: ["lat", "lon"] },
    ];
    const e = entrada({ lightningCount: 5, rain: 3 });
    const novo = B.avaliar(e, contexto({ attractor: 4 }, null, cat));
    const velho = estudo.criterioB(paraOEstudo(e), cat, { attractor: 4 });
    assert.equal(novo.vencedor.id, "chuva");
    assert.equal(novo.escolha, "lluvia");
    assert.equal(novo.motivo, velho.motivo);
    assert.match(novo.motivo, /Para não repetir/);
  });

  test("tudo null → calmaria, sem lançar", () => {
    const nulo = Object.fromEntries(Object.keys(entrada()).map((k) => [k, null])) as EntradaClima;
    for (const c of [B, D]) {
      const r = c.avaliar(nulo, contexto());
      assert.equal(r.vencedor.id, "calmaria");
      assert.match(r.motivo, /não respondeu/);
    }
  });

  test("circuito: um nó de decisão, tipos, ranking e ligações coerentes", () => {
    const r = B.avaliar(entrada({ rain: 12, humidity: 95 }), contexto());
    const nos = r.circuito.nos;
    assert.equal(nos.filter((n) => n.estagio === "decisao").length, 1);
    assert.equal(nos.filter((n) => n.id.startsWith("tipo:")).length, 10);
    assert.ok(nos.some((n) => n.id === "ranking"));
    const chuva = nos.find((n) => n.id === "tipo:chuva");
    assert.equal(chuva?.ativo, true);
    const lig = r.circuito.ligacoes.find((l) => l.de === "entrada:rain" && l.para === "tipo:chuva");
    assert.equal(lig?.ativa, true);
    assert.ok(r.circuito.ligacoes.some((l) => l.de === "ranking" && l.para === "decisao:rodizio"));
    assert.ok(r.circuito.ligacoes.some((l) => l.de === "entrada:temperature" && l.para === "tipo:frio"));
  });
});
