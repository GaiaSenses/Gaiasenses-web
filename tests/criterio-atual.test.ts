/**
 * Critério 0 · Atual: equivalência com a produção congelada (894a0ac) e com o estudo.
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { CriterioAtual, CANDIDATAS } from "../lib/criterios/criterio-atual";
import { catalogoHabilitado } from "../lib/criterios/catalogo";
import type { ContextoDeDecisao, EntradaClima } from "../lib/criterios/tipos";
import { getCompositionDecisionTrace } from "./fixtures/criterio-producao";
import estudo from "./fixtures/estudo-criterios.cjs";

const criterio = new CriterioAtual();
const catalogo = catalogoHabilitado();

const entrada = (parcial: Partial<EntradaClima> = {}): EntradaClima => ({
  temperature: 0, humidity: 0, clouds: 0, rain: 0, windSpeed: 0, windDeg: 0,
  lightningCount: 0, fireCount: 0, closeFires: 0, lat: 0, lon: 0,
  ...parcial,
});

const contexto = (r = 0): ContextoDeDecisao => ({
  catalogo, memoria: {}, normal: null, sortear: () => r,
});

function mulberry32(semente: number): () => number {
  let a = semente;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BORDAS = {
  temperature: [35, 35.01, -5, 0, 34.99, 40],
  clouds: [50, 51, 0, 49.99, 100],
  windSpeed: [6.25, 0, 3],
  humidity: [0, 10, 100],
  rain: [0, 0.5, 10],
  lightningCount: [0, 1],
  fireCount: [0, 1],
} as const;

function climaAleatorio(rng: () => number): EntradaClima {
  const borda = rng() < 0.3;
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
  const campo = (nome: keyof typeof BORDAS, max: number): number | null => {
    if (borda) {
      if (rng() < 0.1) return null;
      return pick(BORDAS[nome]) as number;
    }
    return rng() * max;
  };
  return entrada({
    temperature: borda ? (campo("temperature", 0) as number | null) : rng() * 60 - 10,
    humidity: campo("humidity", 100),
    clouds: campo("clouds", 100),
    rain: campo("rain", 20),
    windSpeed: campo("windSpeed", 25),
    lightningCount: borda ? campo("lightningCount", 0) : (rng() < 0.2 ? Math.floor(rng() * 5) : 0),
    fireCount: borda ? campo("fireCount", 0) : (rng() < 0.2 ? Math.floor(rng() * 5) : 0),
  });
}

const z = (v: number | null) => (v === null || Number.isNaN(v) ? 0 : v);
const comoClima = (e: EntradaClima) => ({
  windSpeed: z(e.windSpeed), humidity: z(e.humidity), clouds: z(e.clouds),
  temperature: z(e.temperature), lightnings: z(e.lightningCount),
  fireSpots: z(e.fireCount), rain: z(e.rain),
});

describe("CriterioAtual · equivalência", () => {
  test("equivale à produção em 5000 climas", () => {
    const rng = mulberry32(20261126);
    const original = Math.random;
    try {
      for (let i = 0; i < 5000; i++) {
        const e = climaAleatorio(rng);
        const r = rng();
        Math.random = () => r;
        const velho = getCompositionDecisionTrace(comoClima(e));
        const novo = criterio.avaliar(e, contexto(r));

        for (const k of ["atmosphere", "fulmen", "pyro", "hydros", "entropy"] as const) {
          assert.ok(Object.is(novo.numeros[k], velho.scores[k]), `score ${k} #${i}`);
        }
        assert.equal(novo.vencedor.id, velho.categoria, `categoria #${i}`);
        assert.equal(novo.escolha, velho.escolha, `escolha #${i}`);
      }
    } finally {
      Math.random = original;
    }
  });

  test("ruleDeltas e scores de pontuarAtual batem com a produção", async () => {
    const { pontuarAtual } = await import("../lib/criterios/criterio-atual");
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const clima = comoClima(climaAleatorio(rng));
      const velho = getCompositionDecisionTrace(clima);
      const novo = pontuarAtual(clima);
      assert.equal(novo.categoria, velho.categoria);
      assert.deepEqual(Object.keys(novo.ruleDeltas), ["fulmen", "pyro", "atmosphere", "hydros"]);
      for (const regra of Object.keys(velho.ruleDeltas)) {
        for (const k of Object.keys(velho.scores) as (keyof typeof velho.scores)[]) {
          assert.ok(
            Object.is(novo.ruleDeltas[regra][k], velho.ruleDeltas[regra][k]),
            `delta ${regra}.${k} #${i}`,
          );
        }
      }
      for (const k of Object.keys(velho.scores) as (keyof typeof velho.scores)[]) {
        assert.ok(Object.is(novo.scores[k], velho.scores[k]), `score ${k} #${i}`);
      }
    }
  });

  test("equivale ao criterioAtual do estudo", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const e = climaAleatorio(rng);
      const velho = estudo.criterioAtual(e);
      const novo = criterio.avaliar(e, contexto(0.5));
      assert.equal(novo.vencedor.id, velho.vencedor);
      assert.equal(novo.candidatas.length, Object.keys(velho.probs).length);
      for (const c of novo.candidatas) {
        assert.ok(Math.abs(c.probabilidade - (velho.probs as Record<string, number>)[c.obra]) < 1e-12, `${c.obra} #${i}`);
      }
    }
  });
});

describe("CriterioAtual · regras", () => {
  test("empate vai para a categoria que vem depois", () => {
    // atmosphere = 25; hydros = 5 + 3 = 8 + ... ; vento 6,25 → 25 = piso de entropy
    const r = criterio.avaliar(entrada({ windSpeed: 6.25, temperature: 10, humidity: 10 }), contexto());
    assert.equal(r.vencedor.id, "entropy");
  });

  test("raio e fogo juntos → pyro", () => {
    const r = criterio.avaliar(entrada({ lightningCount: 3, fireCount: 2 }), contexto());
    assert.equal(r.vencedor.id, "pyro");
    assert.equal(r.numeros.fulmen, 90);
    assert.equal(r.numeros.pyro, 100);
  });

  test("limiar é estrito em 35 °C e em 50 % de nuvens", () => {
    assert.equal(criterio.avaliar(entrada({ temperature: 35 }), contexto()).numeros.pyro, 0);
    assert.equal(criterio.avaliar(entrada({ temperature: 35.01 }), contexto()).numeros.pyro, 40);
    assert.equal(criterio.avaliar(entrada({ clouds: 50 }), contexto()).numeros.atmosphere, 0);
    assert.equal(criterio.avaliar(entrada({ clouds: 51 }), contexto()).numeros.atmosphere, 30);
  });

  test("tudo null → igual a tudo 0", () => {
    const nulo = Object.fromEntries(
      Object.keys(entrada()).map((k) => [k, null]),
    ) as EntradaClima;
    const a = criterio.avaliar(nulo, contexto(0.3));
    const b = criterio.avaliar(entrada(), contexto(0.3));
    assert.deepEqual(a.numeros, b.numeros);
    assert.equal(a.escolha, b.escolha);
    assert.equal(a.vencedor.id, b.vencedor.id);
  });

  test("candidatas: lista da categoria vencedora, 1/n cada, sorteio uniforme", () => {
    const r = criterio.avaliar(entrada({ lightningCount: 1 }), contexto());
    assert.equal(r.vencedor.id, "fulmen");
    assert.equal(r.sorteio, "uniforme");
    assert.deepEqual(r.candidatas.map((c) => c.obra), CANDIDATAS.fulmen);
    for (const c of r.candidatas) assert.equal(c.probabilidade, 1 / CANDIDATAS.fulmen.length);
  });
});

describe("CriterioAtual · circuito", () => {
  const ligacoesDe = (r: ReturnType<CriterioAtual["avaliar"]>, de: string, para?: string) =>
    r.circuito.ligacoes.filter((l) => l.de === de && (para === undefined || l.para === para));

  test("U1 aceso só com raios > 0", () => {
    const sem = criterio.avaliar(entrada(), contexto());
    const com = criterio.avaliar(entrada({ lightningCount: 2 }), contexto());
    assert.equal(sem.circuito.nos.find((n) => n.id === "regra:raios")?.designador, "U1");
    assert.equal(ligacoesDe(sem, "entrada:lightningCount", "regra:raios")[0].ativa, false);
    assert.equal(ligacoesDe(com, "entrada:lightningCount", "regra:raios")[0].ativa, true);
    assert.equal(ligacoesDe(com, "regra:raios", "categoria:fulmen")[0].ativa, true);
    assert.equal(ligacoesDe(sem, "regra:raios", "categoria:fulmen")[0].ativa, false);
  });

  test("8 CIs, 5 categorias e exatamente um nó de decisão", () => {
    const r = criterio.avaliar(entrada({ windSpeed: 10 }), contexto());
    const nos = r.circuito.nos;
    assert.deepEqual(
      nos.filter((n) => n.estagio === "transformacao").map((n) => n.designador),
      ["U1", "U2", "U3", "U4", "U5", "U6", "U7", "U8"],
    );
    assert.equal(nos.filter((n) => n.estagio === "agregacao").length, 5);
    assert.equal(nos.filter((n) => n.estagio === "decisao").length, 1);
    const entrou = ligacoesDe(r, "categoria:atmosphere", "decisao:max")[0];
    assert.equal(entrou.ativa, true);
    assert.equal(entrou.intensidade, 1);
    assert.equal(ligacoesDe(r, "categoria:fulmen", "decisao:max")[0].ativa, false);
  });
});
