/**
 * Motor da placa: a geometria genérica do circuito de qualquer critério.
 * Roda sobre os circuitos reais dos 5 critérios nos presets "limpo" e "temporal".
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ENTRADAS, PRESETS, entradaEfetiva } from "../app/[locale]/simulator/cenario";
import { montarPlaca, type GeometriaPlaca } from "../app/[locale]/simulator/layout-placa";
import { gerenciador } from "../lib/criterios/gerenciador";
import { catalogoHabilitado } from "../lib/criterios/catalogo";
import { normalDe } from "../lib/criterios/normais-do-estudo";
import type { Circuito } from "../lib/criterios/tipos";

type No = GeometriaPlaca["nos"][number];
type Ponto = [number, number];

const SO_DA_OBRA = ENTRADAS.filter((e) => e.grupo === "obra").map((e) => e.nome);
const catalogo = catalogoHabilitado();

const caso = (nome: string, circuito: Circuito) => ({ nome, circuito, placa: montarPlaca(circuito, SO_DA_OBRA) });

const REAIS = ["limpo", "temporal"].flatMap((id) => {
  const { cenario } = PRESETS.find((p) => p.id === id)!;
  const { cidade, mes, periodo } = cenario.normalRef;
  const resultados = gerenciador.avaliarTodos(entradaEfetiva(cenario), (c) => ({
    catalogo,
    memoria: {},
    normal: c.usaNormal ? normalDe(cidade, mes, periodo) : null,
    sortear: () => 0.5,
  }));
  return resultados.map((r) => {
    if (!r.ok) throw new Error(`${id}/${r.criterio.id}: ${r.erro}`);
    return caso(`${id}/${r.criterio.id}`, r.resultado.circuito);
  });
});

/** Nenhum critério pula colunas hoje; este caso (o C no dia limpo, com 2 ligações a mais) cobre a rota pelo canal de baixo. */
const PULA_COLUNAS = (() => {
  const base = REAIS.find((c) => c.nome === "limpo/C")!.circuito;
  const ultimaObra = base.nos.filter((n) => n.estagio === "obra").at(-1)!.id;
  return caso("sintético/pula colunas", {
    nos: base.nos,
    ligacoes: [
      ...base.ligacoes,
      { de: "entrada:temperature", para: "familia:temperatura", ativa: true, intensidade: 0.7 },
      { de: "tipo:raios", para: ultimaObra, ativa: false, intensidade: 0 },
    ],
  });
})();

const CASOS = [...REAIS, PULA_COLUNAS];

const noPorId = (placa: GeometriaPlaca, id: string): No => {
  const no = placa.nos.find((n) => n.id === id);
  assert.ok(no, `nó ${id} não está na placa`);
  return no;
};
const naBordaDireita = (no: No, [x, y]: Ponto) => x === no.x + no.largura && y > no.y && y < no.y + no.altura;
const naBordaEsquerda = (no: No, [x, y]: Ponto) => x === no.x && y > no.y && y < no.y + no.altura;
const segmentos = (pontos: Ponto[]): [Ponto, Ponto][] => pontos.slice(1).map((p, i) => [pontos[i], p]);

describe("motor da placa", () => {
  test("há os 10 circuitos reais e um que pula colunas", () => {
    assert.equal(REAIS.length, 10);
    const colunas = ["entrada", "transformacao", "agregacao", "decisao", "obra"];
    const estagio = new Map(PULA_COLUNAS.circuito.nos.map((n) => [n.id, colunas.indexOf(n.estagio)]));
    const pulos = PULA_COLUNAS.circuito.ligacoes.filter((l) => estagio.get(l.para)! - estagio.get(l.de)! > 1);
    assert.equal(pulos.length, 2);
  });

  test("nenhum nó se sobrepõe", () => {
    for (const { nome, circuito, placa } of CASOS) {
      assert.deepEqual(placa.nos.map((n) => n.id), circuito.nos.map((n) => n.id), nome);
      for (const [i, a] of placa.nos.entries()) {
        assert.ok(a.largura > 0 && a.altura > 0, `${nome}: ${a.id} sem tamanho`);
        assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.largura <= placa.largura && a.y + a.altura <= placa.altura, `${nome}: ${a.id} fora da placa`);
        for (const b of placa.nos.slice(i + 1)) {
          const sobrepoe = a.x < b.x + b.largura && b.x < a.x + a.largura && a.y < b.y + b.altura && b.y < a.y + a.altura;
          assert.ok(!sobrepoe, `${nome}: ${a.id} sobrepõe ${b.id}`);
        }
      }
    }
  });

  test("as entradas ficam em linhas de altura fixa", () => {
    for (const { nome, placa } of CASOS) {
      const entradas = placa.nos.filter((n) => n.estagio === "entrada");
      assert.equal(entradas.length, 11, nome);
      for (const [i, e] of entradas.slice(1).entries()) {
        assert.equal(e.y - entradas[i].y, placa.alturaLinha, `${nome}: ${e.id}`);
        assert.equal(e.x, entradas[i].x, `${nome}: ${e.id}`);
      }
    }
  });

  test("toda ligação vira trilha, com as pontas nos pinos dos nós", () => {
    for (const { nome, circuito, placa } of CASOS) {
      const ids = placa.trilhas.map((t) => t.id);
      assert.equal(new Set(ids).size, ids.length, `${nome}: trilha repetida`);
      for (const l of circuito.ligacoes) {
        const id = `${l.de}->${l.para}`;
        const t = placa.trilhas.find((x) => x.id === id);
        assert.ok(t, `${nome}: falta a trilha ${id}`);
        assert.deepEqual(
          { de: t.de, para: t.para, ativa: t.ativa, intensidade: t.intensidade },
          { de: l.de, para: l.para, ativa: l.ativa, intensidade: l.intensidade },
          `${nome}: ${id}`,
        );
        assert.equal(t.direta, undefined, `${nome}: ${id}`);
        assert.ok(naBordaDireita(noPorId(placa, l.de), t.pontos[0]), `${nome}: ${id} não sai do pino`);
        assert.ok(naBordaEsquerda(noPorId(placa, l.para), t.pontos.at(-1)!), `${nome}: ${id} não chega ao pino`);
      }
    }
  });

  test("trilhas só usam 0°, 45° e 90°", () => {
    for (const { nome, placa } of CASOS) {
      for (const t of placa.trilhas) {
        assert.ok(t.pontos.length >= 2, `${nome}: ${t.id}`);
        for (const [[x0, y0], [x1, y1]] of segmentos(t.pontos)) {
          const dx = x1 - x0;
          const dy = y1 - y0;
          assert.ok([x0, y0, x1, y1].every(Number.isInteger), `${nome}: ${t.id} fora da grade`);
          assert.ok(dx !== 0 || dy !== 0, `${nome}: ${t.id} tem segmento nulo`);
          assert.ok(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy), `${nome}: ${t.id} (${dx}, ${dy})`);
        }
        for (const [x, y] of t.pontos) {
          assert.ok(x >= 0 && x <= placa.largura && y >= 0 && y <= placa.altura, `${nome}: ${t.id} sai da placa`);
        }
      }
    }
  });

  test("trilhas não atravessam nós", () => {
    for (const { nome, placa } of CASOS) {
      for (const t of placa.trilhas) {
        for (const [[x0, y0], [x1, y1]] of segmentos(t.pontos)) {
          const passos = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
          for (let k = 0; k <= passos; k++) {
            const x = x0 + (Math.sign(x1 - x0) * k);
            const y = y0 + (Math.sign(y1 - y0) * k);
            const dentro = placa.nos.find((n) => x > n.x && x < n.x + n.largura && y > n.y && y < n.y + n.altura);
            assert.equal(dentro, undefined, `${nome}: ${t.id} atravessa ${dentro?.id} em (${x}, ${y})`);
          }
        }
      }
    }
  });

  test("trilhas diferentes nunca correm no mesmo x vertical", () => {
    for (const { nome, placa } of CASOS) {
      const dono = new Map<number, string>();
      for (const t of placa.trilhas) {
        for (const [[x0, y0], [x1, y1]] of segmentos(t.pontos)) {
          if (x0 !== x1 || y0 === y1) continue;
          const outro = dono.get(x0);
          assert.ok(outro === undefined || outro === t.id, `${nome}: ${t.id} e ${outro} em x = ${x0}`);
          dono.set(x0, t.id);
        }
      }
    }
  });

  test("a obra em destaque liga ao J1, na borda direita", () => {
    for (const { nome, placa } of CASOS) {
      assert.ok(placa.nos.every((n) => n.x + n.largura < placa.j1.x), `${nome}: J1 não está à direita`);
      assert.ok(placa.j1.x <= placa.largura, nome);
      const destaque = placa.nos.find((n) => n.destaque);
      assert.ok(destaque, `${nome}: sem destaque`);
      const t = placa.trilhas.find((x) => x.id === `${destaque.id}->j1`);
      assert.ok(t, `${nome}: falta a trilha do destaque`);
      assert.deepEqual({ de: t.de, para: t.para, ativa: t.ativa, intensidade: t.intensidade }, { de: destaque.id, para: "j1", ativa: true, intensidade: 1 });
      assert.ok(naBordaDireita(destaque, t.pontos[0]), nome);
      assert.deepEqual(t.pontos.at(-1), [placa.j1.x, placa.j1.y], nome);
    }
  });

  test("as entradas só da obra têm trilha direta até o J1", () => {
    assert.deepEqual(SO_DA_OBRA, ["windDeg", "lat", "lon"]);
    for (const { nome, placa } of CASOS) {
      const diretas = placa.trilhas.filter((t) => t.direta);
      assert.equal(diretas.length, SO_DA_OBRA.length, nome);
      const fundoDosNos = Math.max(...placa.nos.map((n) => n.y + n.altura));
      for (const entrada of SO_DA_OBRA) {
        const de = `entrada:${entrada}`;
        const t = diretas.find((x) => x.de === de);
        assert.ok(t, `${nome}: falta a trilha direta de ${entrada}`);
        assert.deepEqual(
          { id: t.id, para: t.para, ativa: t.ativa, intensidade: t.intensidade },
          { id: `${de}->j1`, para: "j1", ativa: true, intensidade: 0.5 },
        );
        assert.ok(naBordaDireita(noPorId(placa, de), t.pontos[0]), `${nome}: ${entrada}`);
        assert.deepEqual(t.pontos.at(-1), [placa.j1.x, placa.j1.y], `${nome}: ${entrada}`);
        assert.ok(t.pontos.some(([, y]) => y > fundoDosNos), `${nome}: ${entrada} não corre pelo barramento de baixo`);
      }
    }
  });

  test("determinístico: a mesma entrada dá a mesma geometria", () => {
    for (const { nome, circuito, placa } of CASOS) {
      assert.deepEqual(montarPlaca(structuredClone(circuito), [...SO_DA_OBRA]), placa, nome);
    }
  });
});
