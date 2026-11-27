/**
 * Contrato das obras desabilitadas temporariamente.
 *
 * Pedido da Prof.ª Artemis (2026-11-27), para uma demonstração: 8 obras saem
 * do sorteio do critério e dos menus, sem serem apagadas. Estes testes travam
 * a lista e garantem que o sorteio nunca as devolve.
 *
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DISABLED_COMPOSITIONS,
  isCompositionEnabled,
  pickEnabledComposition,
} from "../app/[locale]/map3/disabled-compositions";

const ESPERADAS = [
  "rectangles",
  "curves",
  "chaosTree",
  "weatherTree",
  "lluvia",
  "nightRain",
  "pump",
  "lightningBolts",
];

/** Os ids reais das obras, lidos de compositions/<pasta>/composition.json. */
function idsDasObras(): Set<string> {
  const raiz = path.join(process.cwd(), "compositions");
  const ids = new Set<string>();
  for (const pasta of fs.readdirSync(raiz)) {
    const arquivo = path.join(raiz, pasta, "composition.json");
    if (fs.existsSync(arquivo)) {
      ids.add(JSON.parse(fs.readFileSync(arquivo, "utf8")).id);
    }
  }
  return ids;
}

describe("lista de obras desabilitadas", () => {
  test("são exatamente as 8 obras pedidas", () => {
    assert.deepEqual([...DISABLED_COMPOSITIONS].sort(), [...ESPERADAS].sort());
  });

  test("cada nome é o id de uma obra que existe (um erro de grafia não desabilitaria nada)", () => {
    const ids = idsDasObras();
    for (const nome of DISABLED_COMPOSITIONS) {
      assert.ok(ids.has(nome), `"${nome}" não é id de nenhuma obra`);
    }
  });

  test("obras fora da lista seguem habilitadas, inclusive a obra padrão", () => {
    assert.equal(isCompositionEnabled("attractor"), true);
    assert.equal(isCompositionEnabled("airports"), true);
    assert.equal(isCompositionEnabled("zigzag"), true);
    for (const nome of ESPERADAS) {
      assert.equal(isCompositionEnabled(nome), false, nome);
    }
  });
});

describe("sorteio entre as obras habilitadas", () => {
  // A lista hydros do critério atual: 11 obras, 4 delas desabilitadas.
  const HYDROS = [
    "lluvia",
    "zigzag",
    "curves",
    "digitalOrganism",
    "rectangles",
    "nightRain",
    "colorFlower",
    "mudflatScatter",
    "generativeStrings",
    "riverLines",
    "paintBrush",
  ];

  test("nunca devolve uma obra desabilitada", () => {
    let semente = 1;
    const aleatorio = () => {
      // mulberry32: sequência fixa, o teste é reproduzível.
      semente = (semente + 0x6d2b79f5) | 0;
      let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 1000; i++) {
      const escolha = pickEnabledComposition(HYDROS, aleatorio);
      assert.ok(escolha !== null && isCompositionEnabled(escolha), String(escolha));
    }
  });

  test("o sorteio é uniforme entre as habilitadas, na ordem da lista", () => {
    const habilitadas = HYDROS.filter((nome) => !ESPERADAS.includes(nome));
    assert.equal(pickEnabledComposition(HYDROS, () => 0), habilitadas[0]);
    assert.equal(
      pickEnabledComposition(HYDROS, () => 0.999),
      habilitadas[habilitadas.length - 1],
    );
    for (let k = 0; k < habilitadas.length; k++) {
      const r = (k + 0.5) / habilitadas.length;
      assert.equal(pickEnabledComposition(HYDROS, () => r), habilitadas[k]);
    }
  });

  test("lista só com obras desabilitadas devolve null", () => {
    assert.equal(pickEnabledComposition(["lluvia", "curves"], () => 0.5), null);
    assert.equal(pickEnabledComposition([], () => 0.5), null);
  });
});
