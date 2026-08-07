/**
 * Contract tests for the declared-animation runtime.
 *
 * Two functions decide things that fail quietly when wrong: whether an attribute
 * name exists, and which file an animation plays. A mistake in either produces a
 * page that renders — just silent, or with a value stuck at zero.
 *
 * The audio cases are transcribed from the animations that were migrated, so
 * they are also a record of what those pieces used to do. `bonfire`, `stormEye`
 * and `zigzag` decide on two values at once, which is why the rule model takes
 * conditions rather than a single range.
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
  test("aceita os nomes do vocabulário", () => {
    assert.equal(canonicalAttribute("temperature"), "temperature");
    assert.equal(canonicalAttribute("windSpeed"), "windSpeed");
    assert.equal(canonicalAttribute("closeFires"), "closeFires");
  });

  /**
   * Há um nome por dado, e só. O catálogo antigo tinha `windSpeed` numa entrada
   * e `windspeed` noutra; a segunda não chegava a lugar nenhum, e aceitar as
   * duas teria preservado o engano em vez de eliminá-lo.
   */
  test("recusa grafias alternativas", () => {
    assert.equal(canonicalAttribute("windspeed"), null);
    assert.equal(canonicalAttribute("temp"), null);
    assert.equal(canonicalAttribute("lightning"), null);
  });

  test("recusa o que não existe", () => {
    assert.equal(canonicalAttribute("temperatura"), null);
    assert.equal(canonicalAttribute(""), null);
  });
});

describe("resolveAudio", () => {
  test("sem áudio devolve vazio", () => {
    assert.equal(resolveAudio({ kind: "none" }, { rain: 4 }), "");
  });

  /** Quando o som vem de um patch Pd, não há arquivo a tocar. */
  test("áudio de patch não devolve arquivo", () => {
    assert.equal(resolveAudio({ kind: "patch" }, { rain: 4 }), "");
  });

  test("arquivo fixo vira caminho em /audios", () => {
    assert.equal(
      resolveAudio({ kind: "mp3", file: "NRheavy.mp3" }, {}),
      "/audios/NRheavy.mp3",
    );
  });

  /** Transcrito de night-rain. */
  const chuva: CompositionAudio = {
    kind: "mp3",
    rules: [
      { when: { rain: { max: 0 } }, file: "" },
      { when: { rain: { below: 3 } }, file: "NRlight.mp3" },
      { when: { rain: { below: 6 } }, file: "NRmedium.mp3" },
      { file: "NRheavy.mp3" },
    ],
  };

  test("a primeira regra que couber decide", () => {
    assert.equal(resolveAudio(chuva, { rain: 0 }), "");
    assert.equal(resolveAudio(chuva, { rain: 1 }), "/audios/NRlight.mp3");
    assert.equal(resolveAudio(chuva, { rain: 4 }), "/audios/NRmedium.mp3");
    assert.equal(resolveAudio(chuva, { rain: 50 }), "/audios/NRheavy.mp3");
  });

  test("`below` é estrito e `max` é inclusivo", () => {
    assert.equal(resolveAudio(chuva, { rain: 2.999 }), "/audios/NRlight.mp3");
    assert.equal(resolveAudio(chuva, { rain: 3 }), "/audios/NRmedium.mp3");
    assert.equal(resolveAudio(chuva, { rain: 0.0001 }), "/audios/NRlight.mp3");
  });

  test("arquivo vazio é silêncio declarado", () => {
    assert.equal(resolveAudio(chuva, { rain: 0 }), "");
  });

  test("dado ausente vale zero", () => {
    assert.equal(resolveAudio(chuva, {}), "");
  });

  /**
   * Transcrito de bonfire, que decide por dois valores: quantos focos há, e
   * quantos estão a menos de 50 km.
   */
  const fogo: CompositionAudio = {
    kind: "mp3",
    rules: [
      { when: { fireCount: { min: 4 }, closeFires: { min: 2 } }, file: "FOGO-AA.mp3" },
      { when: { fireCount: { min: 4 } }, file: "FOGO-AB.mp3" },
      { when: { closeFires: { min: 2 } }, file: "FOGO-BA.mp3" },
      { file: "FOGO-BB.mp3" },
    ],
  };

  test("uma regra com dois dados exige os dois", () => {
    assert.equal(resolveAudio(fogo, { fireCount: 5, closeFires: 3 }), "/audios/FOGO-AA.mp3");
    assert.equal(resolveAudio(fogo, { fireCount: 5, closeFires: 1 }), "/audios/FOGO-AB.mp3");
    assert.equal(resolveAudio(fogo, { fireCount: 2, closeFires: 3 }), "/audios/FOGO-BA.mp3");
    assert.equal(resolveAudio(fogo, { fireCount: 0, closeFires: 0 }), "/audios/FOGO-BB.mp3");
  });

  /** Transcrito de zigzag, que usa os operadores estritos. */
  const zigzag: CompositionAudio = {
    kind: "mp3",
    rules: [
      { when: { rain: { above: 20 }, lightningCount: { above: 4 } }, file: "ZigZag-AA.mp3" },
      { when: { rain: { above: 20 } }, file: "ZigZag-AB.mp3" },
      { when: { lightningCount: { above: 4 } }, file: "ZigZag-BA.mp3" },
      { file: "ZigZag-BB.mp3" },
    ],
  };

  test("`above` é estrito", () => {
    assert.equal(resolveAudio(zigzag, { rain: 21, lightningCount: 5 }), "/audios/ZigZag-AA.mp3");
    // Exatamente no limite não passa: o original era `> 20`, não `>= 20`.
    assert.equal(resolveAudio(zigzag, { rain: 20, lightningCount: 4 }), "/audios/ZigZag-BB.mp3");
  });

  test("sem regra que caiba, fica em silêncio", () => {
    const incompleta: CompositionAudio = {
      kind: "mp3",
      rules: [{ when: { rain: { min: 100 } }, file: "NRheavy.mp3" }],
    };

    assert.equal(resolveAudio(incompleta, { rain: 0 }), "");
  });
});
