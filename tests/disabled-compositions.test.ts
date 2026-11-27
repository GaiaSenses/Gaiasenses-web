/**
 * Contrato das obras desabilitadas temporariamente.
 *
 * Pedido da Prof.ª Artemis (2026-11-27), para uma demonstração: algumas obras
 * saem do sorteio do critério, dos menus e do modo exposição, sem serem
 * apagadas. Os testes leem a própria lista de `disabled-compositions.ts` em vez
 * de repeti-la, para que reabilitar uma obra continue sendo tirar uma linha de
 * lá, sem mexer aqui.
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
  setTourComposition,
} from "../app/[locale]/map3/disabled-compositions";

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

const DESABILITADAS = [...DISABLED_COMPOSITIONS];

describe("lista de obras desabilitadas", () => {
  test("cada nome é o id de uma obra que existe (um erro de grafia não desabilitaria nada)", () => {
    const ids = idsDasObras();
    for (const nome of DESABILITADAS) {
      assert.ok(ids.has(nome), `"${nome}" não é id de nenhuma obra`);
    }
  });

  test("a obra padrão do critério (attractor) nunca é desabilitada", () => {
    // É ela que toca quando uma categoria fica sem obra habilitada.
    assert.equal(isCompositionEnabled("attractor"), true);
  });

  test("as obras da lista ficam desabilitadas e todas as outras, habilitadas", () => {
    for (const id of idsDasObras()) {
      assert.equal(isCompositionEnabled(id), !DISABLED_COMPOSITIONS.has(id), id);
    }
  });
});

describe("sorteio entre as obras habilitadas", () => {
  // A lista hydros do critério atual (11 obras).
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
  const habilitadas = HYDROS.filter(isCompositionEnabled);

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
    assert.equal(pickEnabledComposition(DESABILITADAS, () => 0.5), null);
    assert.equal(pickEnabledComposition([], () => 0.5), null);
  });
});

describe("parada do modo exposição", () => {
  // Um roteiro salvo no navegador antes da desabilitação pode apontar para
  // uma obra desabilitada; ela não pode chegar ao público pelo passeio.
  test("obra habilitada vai para a URL", () => {
    const params = new URLSearchParams("lat=1&composition=antiga");
    setTourComposition(params, "attractor");
    assert.equal(params.get("composition"), "attractor");
  });

  test(
    "obra desabilitada sai da URL e o critério escolhe a obra da cidade",
    { skip: DESABILITADAS.length === 0 && "nenhuma obra desabilitada" },
    () => {
      const params = new URLSearchParams("lat=1&composition=antiga");
      setTourComposition(params, DESABILITADAS[0]);
      assert.equal(params.has("composition"), false);
      assert.equal(params.get("lat"), "1");
    },
  );
});
