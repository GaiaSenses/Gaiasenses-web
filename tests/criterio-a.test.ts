/**
 * Critério A · Recalibração: equivalência com o `criterioA` do estudo e regras novas.
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { CriterioA } from "../lib/criterios/criterio-a";
import { CANDIDATAS } from "../lib/criterios/criterio-atual";
import { catalogoHabilitado } from "../lib/criterios/catalogo";
import type { ContextoDeDecisao, EntradaClima } from "../lib/criterios/tipos";
import estudo from "./fixtures/estudo-criterios.cjs";

const criterio = new CriterioA();
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
  humidity: [0, 10, 80, 80.01, 81, 100],
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

describe("CriterioA · equivalência com o estudo", () => {
  test("equivale ao criterioA do estudo em 5000 climas", () => {
    const rng = mulberry32(20261127);
    for (let i = 0; i < 5000; i++) {
      const e = climaAleatorio(rng);
      const velho = estudo.criterioA(e);
      const novo = criterio.avaliar(e, contexto(rng()));

      assert.equal(novo.vencedor.id, velho.vencedor, `vencedor #${i}`);
      for (const k of ["atmosphere", "fulmen", "pyro", "hydros", "entropy"] as const) {
        assert.ok(Object.is(novo.numeros[k], velho.scores[k]), `score ${k} #${i}`);
      }
      const probs = velho.probs as Record<string, number>;
      assert.equal(novo.candidatas.length, Object.keys(probs).length, `n #${i}`);
      for (const c of novo.candidatas) {
        assert.ok(Math.abs(c.probabilidade - probs[c.obra]) < 1e-12, `${c.obra} #${i}`);
      }
    }
  });
});

describe("CriterioA · regras", () => {
  test("identidade", () => {
    assert.equal(criterio.id, "A");
    assert.equal(criterio.versao, 1);
    assert.equal(criterio.nome, "Recalibração");
  });

  test("umidade 80 não soma; 81 soma 40,5", () => {
    assert.equal(criterio.avaliar(entrada({ humidity: 80 }), contexto()).numeros.hydros, 0);
    assert.equal(criterio.avaliar(entrada({ humidity: 81 }), contexto()).numeros.hydros, 40.5);
  });

  test("raios somam 120 e a temperatura não entra em hydros", () => {
    const r = criterio.avaliar(entrada({ lightningCount: 1, temperature: 30 }), contexto());
    assert.equal(r.numeros.fulmen, 120);
    assert.equal(r.numeros.hydros, 0);
  });

  test("tudo null não lança e vale tudo 0", () => {
    const nulo = Object.fromEntries(Object.keys(entrada()).map((k) => [k, null])) as EntradaClima;
    const a = criterio.avaliar(nulo, contexto(0.3));
    const b = criterio.avaliar(entrada(), contexto(0.3));
    assert.deepEqual(a.numeros, b.numeros);
    assert.equal(a.escolha, b.escolha);
  });

  test("candidatas: lista da vencedora na ordem escrita, 1/n, sorteio uniforme", () => {
    const r = criterio.avaliar(entrada({ fireCount: 1 }), contexto());
    assert.equal(r.vencedor.id, "pyro");
    assert.equal(r.sorteio, "uniforme");
    assert.deepEqual(r.candidatas.map((c) => c.obra), CANDIDATAS.pyro);
  });

  test("circuito: U1..U7, 5 categorias, um nó de decisão", () => {
    const r = criterio.avaliar(entrada({ humidity: 90 }), contexto());
    const nos = r.circuito.nos;
    assert.deepEqual(
      nos.filter((n) => n.estagio === "transformacao").map((n) => n.designador),
      ["U1", "U2", "U3", "U4", "U5", "U6", "U7"],
    );
    assert.equal(nos.filter((n) => n.estagio === "agregacao").length, 5);
    assert.equal(nos.filter((n) => n.estagio === "decisao").length, 1);
    assert.equal(nos.find((n) => n.id === "regra:umidade")?.ativo, true);
  });
});
