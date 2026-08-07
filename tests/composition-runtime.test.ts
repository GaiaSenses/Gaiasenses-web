/**
 * Contract tests for the declared-animation runtime.
 *
 * The two functions here decide things that fail quietly when wrong: which file
 * an animation plays, and whether a legacy attribute name still resolves. A
 * mistake in either produces a page that renders — just with the wrong sound,
 * or with a value stuck at zero.
 *
 * The rest of the runtime fetches over the network and returns JSX, and is
 * covered end to end instead: `compositions:validate` refuses a manifest that
 * asks for a dataitem that does not exist, and the browser check confirms the
 * fetched values reach the sketch.
 *
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  canonicalAttribute,
  resolveAudio,
  type CompositionAudio,
} from "@/components/compositions/composition-data";

describe("canonicalAttribute", () => {
  test("aceita os nomes canônicos", () => {
    assert.equal(canonicalAttribute("temperature"), "temperature");
    assert.equal(canonicalAttribute("windSpeed"), "windSpeed");
    assert.equal(canonicalAttribute("fireCount"), "fireCount");
  });

  /**
   * O catálogo antigo trazia `windspeed` minúsculo numa entrada e `windSpeed`
   * noutra. Uma animação migrada não deveria precisar ser reescrita por causa
   * disso, então o apelido resolve.
   */
  test("resolve as grafias antigas do catálogo", () => {
    assert.equal(canonicalAttribute("windspeed"), "windSpeed");
    assert.equal(canonicalAttribute("lightning"), "lightningCount");
    assert.equal(canonicalAttribute("temp"), "temperature");
  });

  test("recusa o que não existe", () => {
    assert.equal(canonicalAttribute("temperatura"), null);
    assert.equal(canonicalAttribute(""), null);
  });
});

describe("resolveAudio", () => {
  const valores = { rain: 4, temperature: 20 };

  test("sem áudio devolve vazio", () => {
    assert.equal(resolveAudio({ kind: "none" }, valores), "");
  });

  /** Quando o som vem de um patch Pd, não há arquivo a tocar. */
  test("áudio de patch não devolve arquivo", () => {
    assert.equal(resolveAudio({ kind: "patch" }, valores), "");
  });

  test("arquivo fixo vira caminho em /audios", () => {
    assert.equal(
      resolveAudio({ kind: "mp3", file: "NRheavy.mp3" }, valores),
      "/audios/NRheavy.mp3",
    );
  });

  const porFaixa: CompositionAudio = {
    kind: "mp3",
    by: "rain",
    steps: [
      { below: 3, file: "NRlight.mp3" },
      { below: 6, file: "NRmedium.mp3" },
      { file: "NRheavy.mp3" },
    ],
  };

  test("escolhe a faixa pelo valor", () => {
    assert.equal(resolveAudio(porFaixa, { rain: 0 }), "/audios/NRlight.mp3");
    assert.equal(resolveAudio(porFaixa, { rain: 4 }), "/audios/NRmedium.mp3");
    assert.equal(resolveAudio(porFaixa, { rain: 50 }), "/audios/NRheavy.mp3");
  });

  /** O limite é exclusivo: `below: 3` significa "menor que 3", não "até 3". */
  test("o limite da faixa é exclusivo", () => {
    assert.equal(resolveAudio(porFaixa, { rain: 2.999 }), "/audios/NRlight.mp3");
    assert.equal(resolveAudio(porFaixa, { rain: 3 }), "/audios/NRmedium.mp3");
  });

  /** Uma faixa com arquivo vazio é silêncio declarado, não ausência de regra. */
  test("faixa com arquivo vazio é silêncio", () => {
    const comSilencio: CompositionAudio = {
      kind: "mp3",
      by: "rain",
      steps: [
        { below: 0.1, file: "" },
        { file: "NRheavy.mp3" },
      ],
    };

    assert.equal(resolveAudio(comSilencio, { rain: 0 }), "");
    assert.equal(resolveAudio(comSilencio, { rain: 5 }), "/audios/NRheavy.mp3");
  });

  /** Um dado ausente vale zero, como em todo o resto do runtime. */
  test("dado ausente cai na primeira faixa", () => {
    assert.equal(resolveAudio(porFaixa, {}), "/audios/NRlight.mp3");
  });

  test("o `by` também aceita grafia antiga", () => {
    const porApelido: CompositionAudio = {
      kind: "mp3",
      by: "temp",
      steps: [{ below: 10, file: "NRlight.mp3" }, { file: "NRheavy.mp3" }],
    };

    assert.equal(resolveAudio(porApelido, { temperature: 5 }), "/audios/NRlight.mp3");
    assert.equal(resolveAudio(porApelido, { temperature: 30 }), "/audios/NRheavy.mp3");
  });
});
