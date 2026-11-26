/**
 * Contrato do framework de critérios: sorteio, circuito e gerenciador.
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { CriterioDeDecisao } from "../lib/criterios/criterio-de-decisao";
import { GerenciadorDeCriterios } from "../lib/criterios/gerenciador";
import type {
  Calculo,
  ContextoDeDecisao,
  EntradaClima,
  IdCriterio,
  NomeEntrada,
  ObraDoCatalogo,
} from "../lib/criterios/tipos";

const obra = (id: string): ObraDoCatalogo => ({ id: id as ObraDoCatalogo["id"], label: id, attributes: [] });
const catalogo = [obra("o1"), obra("o2"), obra("o3")];

const entrada: EntradaClima = {
  temperature: 20, humidity: null, clouds: 50, rain: 0, windSpeed: 3, windDeg: 90,
  lightningCount: 0, fireCount: 0, closeFires: 0, lat: -22, lon: -43,
};

const contexto = (r = 0): ContextoDeDecisao => ({
  catalogo, memoria: {}, normal: null, sortear: () => r,
});

class Falso extends CriterioDeDecisao {
  readonly id: IdCriterio;
  readonly versao = 1;
  readonly nome = "Falso";
  readonly resumo = "falso";
  readonly usaMemoria = false;
  readonly usaNormal = false;
  readonly entradasUsadas: readonly NomeEntrada[] = ["temperature", "humidity"];
  private sorteio: Calculo["sorteio"];
  private probs: number[];
  private falha: boolean;
  constructor(id: IdCriterio, sorteio: Calculo["sorteio"], probs: number[], falha = false) {
    super();
    this.id = id;
    this.sorteio = sorteio;
    this.probs = probs;
    this.falha = falha;
  }
  protected calcular(): Calculo {
    if (this.falha) throw new Error("explodiu");
    return {
      vencedor: { id: "v", rotulo: "v" },
      candidatas: this.probs.map((p, i) => ({ obra: catalogo[i].id, probabilidade: p })),
      sorteio: this.sorteio,
      motivo: "teste",
      numeros: {},
      circuito: {
        nos: [{ id: "dec", estagio: "decisao", rotulo: "dec", ativo: true }],
        ligacoes: [],
      },
    };
  }
}

describe("sorteio", () => {
  test("uniforme usa floor(r*n)", () => {
    const r = new Falso("A", "uniforme", [1, 1, 1]).avaliar(entrada, contexto(0.67));
    assert.equal(r.escolha, "o3");
  });

  test("ponderado acumula na ordem do catálogo", () => {
    const c = new Falso("A", "ponderado", [0.2, 0.5, 0.3]);
    assert.equal(c.avaliar(entrada, contexto(0.69)).escolha, "o2");
    assert.equal(c.avaliar(entrada, contexto(0.71)).escolha, "o3");
  });

  test("determinístico pega a primeira e não sorteia", () => {
    let sorteios = 0;
    const ctx = { ...contexto(), sortear: () => (sorteios++, 0.99) };
    const r = new Falso("A", "deterministico", [1, 0, 0]).avaliar(entrada, ctx);
    assert.equal(r.escolha, "o1");
    assert.equal(sorteios, 0);
  });

  test("sem candidatas, escolha é null", () => {
    assert.equal(new Falso("A", "uniforme", []).avaliar(entrada, contexto(0.5)).escolha, null);
  });
});

describe("avaliar", () => {
  test("completa o circuito", () => {
    const r = new Falso("A", "ponderado", [0.2, 0.5, 0.3]).avaliar(entrada, contexto(0.5));
    const entradas = r.circuito.nos.filter((n) => n.estagio === "entrada");
    assert.equal(entradas.length, 11);
    assert.deepEqual(
      entradas.filter((n) => n.ativo).map((n) => n.id),
      ["entrada:temperature"], // humidity é null
    );
    const obras = r.circuito.nos.filter((n) => n.estagio === "obra");
    assert.deepEqual(obras.map((n) => n.id), ["obra:o1", "obra:o2", "obra:o3"]);
    assert.deepEqual(obras.filter((n) => n.destaque).map((n) => n.id), ["obra:o2"]);
    const lig = r.circuito.ligacoes.filter((l) => l.de === "dec");
    assert.deepEqual(lig.map((l) => l.para), ["obra:o1", "obra:o2", "obra:o3"]);
    assert.deepEqual(lig.map((l) => l.intensidade), [0.4, 1, 0.6]);
  });

  test("duracaoMs é número ≥ 0", () => {
    const r = new Falso("A", "uniforme", [1]).avaliar(entrada, contexto());
    assert.equal(typeof r.duracaoMs, "number");
    assert.ok(r.duracaoMs >= 0);
  });
});

describe("GerenciadorDeCriterios", () => {
  test("recusa id duplicado e padrão desconhecido", () => {
    const a = new Falso("A", "uniforme", [1]);
    assert.throws(() => new GerenciadorDeCriterios([a, new Falso("A", "uniforme", [1])], "A"));
    assert.throws(() => new GerenciadorDeCriterios([a], "B"));
  });

  test("resolver", () => {
    const a = new Falso("A", "uniforme", [1]);
    const b = new Falso("B", "uniforme", [1]);
    const g = new GerenciadorDeCriterios([a, b], "A");
    assert.deepEqual(g.resolver("B"), { criterio: b, origem: "navegador" });
    for (const v of ["zz", null, undefined]) {
      assert.deepEqual(g.resolver(v), { criterio: a, origem: "padrao" });
    }
  });

  test("avaliarTodos isola a falha", () => {
    const a = new Falso("A", "uniforme", [1]);
    const b = new Falso("B", "uniforme", [1], true);
    const c = new Falso("C", "uniforme", [1]);
    const g = new GerenciadorDeCriterios([a, b, c], "A");
    const r = g.avaliarTodos(entrada, () => contexto());
    assert.deepEqual(r.map((x) => x.criterio.id), ["A", "B", "C"]);
    assert.deepEqual(r.map((x) => x.ok), [true, false, true]);
    const falha = r[1];
    assert.ok(!falha.ok && falha.erro === "explodiu");
  });
});
