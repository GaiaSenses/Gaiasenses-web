/**
 * Critério C (aderência por obra): equivalência com o estudo.
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { CriterioC } from "../lib/criterios/criterio-c";
import { catalogoHabilitado } from "../lib/criterios/catalogo";
import { LIMIARES, TYPES } from "../lib/criterios/saliencia";
import type { ContextoDeDecisao, EntradaClima, ObraDoCatalogo } from "../lib/criterios/tipos";
import estudo from "./fixtures/estudo-criterios.cjs";

const C = new CriterioC();
const catalogo = catalogoHabilitado();

const entrada = (parcial: Partial<EntradaClima> = {}): EntradaClima => ({
  temperature: 25, humidity: 70, clouds: 20, rain: 0, windSpeed: 3, windDeg: 90,
  lightningCount: 0, fireCount: 0, closeFires: 0, lat: 0, lon: 0,
  ...parcial,
});

const contexto = (sortear: () => number = () => 0): ContextoDeDecisao => ({
  catalogo, memoria: {}, normal: null, sortear,
});

type ResultadoDoEstudo = {
  probs: Record<string, number>; vencedor: string; vencedorLabel: string; motivo: string; escolha: string | null;
};

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

describe("Critério C · equivalência com o estudo", () => {
  test("C equivale ao estudo em 3000 climas", () => {
    const rng = mulberry32(20261129);
    for (let i = 0; i < 3000; i++) {
      const e = climaAleatorio(rng);
      const novo = C.avaliar(e, contexto());
      const velho = estudo.criterioC(paraOEstudo(e), catalogo) as unknown as ResultadoDoEstudo;
      const rotulo = `#${i}`;

      const ids = Object.keys(velho.probs);
      assert.deepEqual(novo.candidatas.map((c) => c.obra).sort(), [...ids].sort(), `candidatas ${rotulo}`);
      for (const c of novo.candidatas) {
        assert.ok(Math.abs(c.probabilidade - velho.probs[c.obra]) < 1e-12, `prob ${c.obra} ${rotulo}`);
      }
      assert.equal(novo.vencedor.id, velho.vencedor, `vencedor ${rotulo}`);
      assert.equal(novo.vencedor.rotulo, velho.vencedorLabel, `rotulo ${rotulo}`);
      assert.equal(novo.motivo, velho.motivo, `motivo ${rotulo}`);

      // O top do estudo (`escolha`) é uma das candidatas de maior probabilidade.
      const maxima = Math.max(...novo.candidatas.map((c) => c.probabilidade));
      assert.ok(Math.abs(velho.probs[velho.escolha as string] - maxima) < 1e-12, `top ${rotulo}`);
    }
  });

  test("candidatas seguem a ordem do catálogo e a nota traz a aderência", () => {
    const novo = C.avaliar(entrada({ rain: 12, humidity: 95, clouds: 100 }), contexto());
    const ordem = catalogo.map((o) => o.id as string);
    const indices = novo.candidatas.map((c) => ordem.indexOf(c.obra));
    assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
    assert.ok(novo.candidatas.every((c) => /^aderência \d+,\d{2}$/.test(c.nota ?? "")));
    assert.equal(novo.sorteio, "ponderado");
  });

  test("o sorteio ponderado percorre as candidatas na ordem do catálogo", () => {
    const base = C.avaliar(entrada({ rain: 12 }), contexto());
    assert.equal(base.escolha, base.candidatas[0].obra);
    const ultimo = C.avaliar(entrada({ rain: 12 }), contexto(() => 0.999999999999));
    assert.equal(ultimo.escolha, ultimo.candidatas[ultimo.candidatas.length - 1].obra);
  });
});

describe("Critério C · propriedades", () => {
  test("probabilidades somam 1", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 300; i++) {
      const r = C.avaliar(climaAleatorio(rng), contexto());
      const soma = r.candidatas.reduce((s, c) => s + c.probabilidade, 0);
      assert.ok(Math.abs(soma - 1) < 1e-12, `soma #${i}`);
    }
  });

  test("obra sem entrada meteorológica fica no piso", () => {
    const cat: ObraDoCatalogo[] = [
      { id: "attractor", label: "Attractor", attributes: ["lightningCount"] },
      { id: "airports", label: "Airports", attributes: ["lat", "lon"] },
    ];
    const r = C.avaliar(entrada(), { ...contexto(), catalogo: cat });
    const airports = r.candidatas.find((c) => c.obra === "airports");
    assert.ok(airports);
    assert.equal(airports.nota, `aderência ${LIMIARES.piso.toFixed(2).replace(".", ",")}`);
  });

  test("tudo null não lança", () => {
    const nulo = Object.fromEntries(Object.keys(entrada()).map((k) => [k, null])) as EntradaClima;
    const r = C.avaliar(nulo, contexto());
    assert.ok(r.candidatas.length > 0);
    assert.equal(r.vencedor.id, "calmaria");
  });

  test("circuito: tipos, famílias e um nó de decisão", () => {
    const r = C.avaliar(entrada({ rain: 12, humidity: 95 }), contexto());
    const nos = r.circuito.nos;
    assert.equal(nos.filter((n) => n.estagio === "decisao").length, 1);
    assert.equal(nos.filter((n) => n.id.startsWith("tipo:")).length, TYPES.length);
    assert.equal(nos.filter((n) => n.id.startsWith("familia:")).length, 8);
    const decisao = nos.find((n) => n.id === "decisao:sorteio");
    assert.equal(decisao?.valor, String(r.candidatas.length));
    assert.equal(nos.find((n) => n.id === "familia:chuva")?.valor, nos.find((n) => n.id === "tipo:chuva")?.valor);
    assert.equal(nos.find((n) => n.id === "familia:neve")?.valor, "sem dado");
    const ligs = r.circuito.ligacoes;
    assert.equal(ligs.find((l) => l.de === "tipo:chuva" && l.para === "familia:chuva")?.ativa, true);
    assert.equal(ligs.find((l) => l.de === "familia:chuva" && l.para === "decisao:sorteio")?.ativa, true);
    assert.ok(ligs.some((l) => l.de === "entrada:rain" && l.para === "tipo:chuva"));
  });
});
