/**
 * Módulo da obra do simulador (D3.6): legenda do áudio, aviso de clima, chave de remontagem,
 * escala do monitor, tick do rodízio e a seleção que fica enquanto a obra toca.
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { DECLARED_COMPOSITION_MANIFESTS } from "@/components/compositions/compositions-manifests.generated";
import type { CompositionManifest } from "@/components/compositions/composition-audio";
import { COMPOSITION_PATCH_ID, MAP3_PD4WEB_PATCHES } from "../app/[locale]/map3/pd4web-patches";
import type { ResultadoDeDecisao } from "../lib/criterios/tipos";
import {
  type AudioDaObra,
  audioDaObra,
  chaveDaObra,
  chaveDeMontagem,
  escalaDoMonitor,
  estadoDoPatch,
  legendaDoAudio,
  patchNaoLeOClima,
  proximoTick,
} from "../app/[locale]/simulator/modulo";
import { leOClima } from "../app/[locale]/simulator/canais";
import { patchDaObra } from "../app/[locale]/simulator/troca-de-patch";
import { manterAoTocar } from "../app/[locale]/simulator/selecao";
import { origemDaEscolha } from "../app/[locale]/simulator/apresentacao";
import { PRESETS, paraPropsDaObra } from "../app/[locale]/simulator/cenario";

const m = DECLARED_COMPOSITION_MANIFESTS as unknown as Record<string, CompositionManifest>;
const queimada = PRESETS.find((p) => p.id === "queimada")!.cenario;

/**
 * A legenda sem a parte do patch: o patch de cada obra é dado do registro (que músicos editam) e
 * tem o teste dele, derivado do próprio registro.
 */
function legenda(obra: string, props: Record<string, number>): string {
  return legendaDoAudio({ ...audioDaObra(obra as never, m[obra], props), patch: null }, null);
}

describe("legenda do áudio", () => {
  test("bonfire na queimada toca FOGO-AA; sem focos perto, FOGO-AB", () => {
    const props = paraPropsDaObra(queimada, m.bonfire.attributes);
    assert.deepEqual(props, { fireCount: 60, closeFires: 14 });
    assert.equal(legenda("bonfire", props), "mp3 · FOGO-AA.mp3");
    assert.equal(legenda("bonfire", { ...props, closeFires: 0 }), "mp3 · FOGO-AB.mp3");
    assert.equal(audioDaObra("bonfire", m.bonfire, props).mp3, "/audios/FOGO-AA.mp3");
  });

  test("o patch de cada obra vem do registro: mapa15 para quem mantém o do mapa", () => {
    // As expectativas saem do registro e dos manifestos, não de uma cópia deles: um mapeamento
    // novo de patch, ou uma obra que passe a manter o patch do mapa, não quebra este teste.
    const doRegistro = COMPOSITION_PATCH_ID as Readonly<Record<string, string>>;
    for (const [obra, manifesto] of Object.entries(m)) {
      const esperado = manifesto.keepMapPatch ? "mapa15" : (doRegistro[obra] ?? null);
      const a = audioDaObra(obra as never, manifesto, {});
      assert.equal(a.patch, esperado, obra);
      if (!esperado) continue;
      assert.ok(legendaDoAudio(a, null).includes(`Pd · ${esperado}`), obra);
      assert.ok(legendaDoAudio(a, "carregando").includes(`Pd · ${esperado} · carregando`), obra);
    }
    // keepMapPatch vence o registro, qualquer que seja a obra.
    assert.equal(patchDaObra("lluvia", { ...m.lluvia, keepMapPatch: true }), "mapa15");
  });

  test("o formato da legenda", () => {
    const so = (a: Partial<AudioDaObra>): AudioDaObra => ({ mp3: "", patch: null, sintese: null, ...a });
    assert.equal(legendaDoAudio(so({ patch: "p" }), null), "Pd · p");
    assert.equal(legendaDoAudio(so({ patch: "p" }), "carregando"), "Pd · p · carregando");
    assert.equal(legendaDoAudio(so({ mp3: "/audios/x.mp3", patch: "p" }), "tocando"), "mp3 · x.mp3 + Pd · p · tocando");
    assert.equal(legendaDoAudio(so({ sintese: "Tone.js" }), null), "síntese Tone.js");
    assert.equal(legendaDoAudio(so({}), null), "sem áudio");
  });

  test("síntese e silêncio", () => {
    assert.equal(legenda("airports", {}), "síntese Tone.js");
    assert.equal(legenda("generativeStrings", {}), "síntese p5.sound");
    assert.equal(legenda("attractor", {}), "sem áudio");
    // Regra que dá silêncio (riverLines com umidade 0).
    assert.equal(legenda("riverLines", { humidity: 0, temperature: 20 }), "sem áudio");
  });

  test("o arquivo aparece com a extensão que tiver", () => {
    assert.equal(legenda("burningTrees", { fireCount: 0 }), "mp3 · burningTrees_noFire.wav");
  });
});

describe("aviso de clima", () => {
  test("o aviso segue os receivers que o registro declara para o patch", () => {
    // Derivado do registro: um músico que ponha [r gaia.rain] num patch não quebra este teste.
    for (const p of MAP3_PD4WEB_PATCHES) {
      assert.equal(patchNaoLeOClima(p.id), !leOClima(p.channels.receivers), p.id);
    }
    assert.equal(patchNaoLeOClima(null), false);
    // Um patch fora do registro não tem receiver nenhum.
    assert.equal(patchNaoLeOClima("patch-fora-do-registro"), true);
  });
  test("lat e lon não contam como clima", () => {
    assert.equal(leOClima({ "gaia.lat": "lati", "gaia.lon": "rot" }), false);
    assert.equal(leOClima({ "gaia.temp": "t" }), true);
    assert.equal(leOClima({ "gaia.wind.deg": "d" }), true);
    assert.equal(leOClima({}), false);
  });
});

describe("estado do patch", () => {
  const base = { desejado: "bubble1", ativo: null, carregando: false, parando: false, falhou: null };
  test("tocando só quando é o ativo e nada está carregando ou parando", () => {
    assert.equal(estadoDoPatch({ ...base, ativo: "bubble1" }), "tocando");
    assert.equal(estadoDoPatch({ ...base, ativo: "bubble1", carregando: true }), "carregando");
    assert.equal(estadoDoPatch({ ...base, ativo: "rain2" }), "carregando");
    assert.equal(estadoDoPatch({ ...base, ativo: "rain2", parando: true }), "carregando");
    assert.equal(estadoDoPatch(base), "carregando");
  });
  test("falha e nenhum pedido", () => {
    assert.equal(estadoDoPatch({ ...base, falhou: "bubble1" }), "não carregou");
    assert.equal(estadoDoPatch({ ...base, falhou: "rain2" }), "carregando");
    assert.equal(estadoDoPatch({ ...base, desejado: null, ativo: "bubble1" }), null);
  });
});

describe("chave de remontagem", () => {
  test("muda com a obra e com um atributo que ela declara", () => {
    const a = chaveDaObra("bonfire", m.bonfire.attributes, { fireCount: 60, closeFires: 14 });
    assert.notEqual(a, chaveDaObra("bonfire", m.bonfire.attributes, { fireCount: 60, closeFires: 0 }));
    assert.notEqual(a, chaveDaObra("burningTrees", m.bonfire.attributes, { fireCount: 60, closeFires: 14 }));
  });
  test("não muda com um dado que a obra não declara", () => {
    const antes = paraPropsDaObra(queimada, m.bonfire.attributes);
    const outroClima = { ...queimada, valores: { ...queimada.valores, temperature: 10, rain: 30 } };
    const depois = paraPropsDaObra(outroClima, m.bonfire.attributes);
    assert.equal(chaveDaObra("bonfire", m.bonfire.attributes, antes), chaveDaObra("bonfire", m.bonfire.attributes, depois));
  });
});

describe("chave de montagem", () => {
  test("o airports não remonta quando lat ou lon mudam (o Discrete dobraria a música)", () => {
    const a = chaveDeMontagem("airports", m.airports.attributes, { lat: -23.55, lon: -46.66 });
    assert.equal(chaveDeMontagem("airports", m.airports.attributes, { lat: -10, lon: -46.66 }), a);
    assert.equal(chaveDeMontagem("airports", m.airports.attributes, { lat: -10, lon: 20 }), a);
    // Mas a chave dos valores muda: é ela que faz os valores novos assentarem e chegarem às props.
    assert.notEqual(
      chaveDaObra("airports", m.airports.attributes, { lat: -10, lon: -46.66 }),
      chaveDaObra("airports", m.airports.attributes, { lat: -23.55, lon: -46.66 }),
    );
  });
  test("trocar de obra remonta o airports", () => {
    assert.notEqual(
      chaveDeMontagem("airports", m.airports.attributes, { lat: 1, lon: 2 }),
      chaveDeMontagem("chaosTree", m.chaosTree.attributes, { lat: 1, lon: 2 }),
    );
  });
  test("as outras obras seguem a chave dos valores", () => {
    const props = { fireCount: 60, closeFires: 14 };
    assert.equal(chaveDeMontagem("bonfire", m.bonfire.attributes, props), chaveDaObra("bonfire", m.bonfire.attributes, props));
    assert.notEqual(
      chaveDeMontagem("chaosTree", m.chaosTree.attributes, { lat: 1, lon: 2 }),
      chaveDeMontagem("chaosTree", m.chaosTree.attributes, { lat: 3, lon: 2 }),
    );
  });
});

describe("escala do monitor", () => {
  const tela = { largura: 1440, altura: 900 };
  test("pela largura quando a altura sobra ou não foi medida", () => {
    assert.equal(escalaDoMonitor({ largura: 360, altura: 0 }, tela), 0.25);
    assert.equal(escalaDoMonitor({ largura: 360, altura: 1000 }, tela), 0.25);
  });
  test("pela altura quando ela aperta", () => {
    assert.equal(escalaDoMonitor({ largura: 1000, altura: 225 }, tela), 0.25);
  });
  test("nunca amplia e sem tela medida é 0", () => {
    assert.equal(escalaDoMonitor({ largura: 4000, altura: 4000 }, tela), 1);
    assert.equal(escalaDoMonitor({ largura: 360, altura: 200 }, { largura: 0, altura: 0 }), 0);
    assert.equal(escalaDoMonitor({ largura: 0, altura: 200 }, tela), 0);
  });
});

describe("tick do rodízio", () => {
  test("segundos de agora, sempre acima do último da memória", () => {
    assert.equal(proximoTick({}, 1000.7), 1000);
    assert.equal(proximoTick({ a: 10, b: 20 }, 1000), 1000);
    assert.equal(proximoTick({ a: 1000 }, 1000.2), 1001);
    assert.equal(proximoTick({ a: 1005, b: 3 }, 1000), 1006);
  });
});

describe("seleção enquanto a obra toca", () => {
  const resultado = (sorteio: string, cands: { obra: string; probabilidade: number }[], escolha: string) =>
    ({ sorteio, candidatas: cands, escolha }) as unknown as ResultadoDeDecisao;
  const sel = (obra: string, origem: "criterio" | "manual" = "criterio") => ({ obra, origem }) as never;

  test("no rodízio a obra que toca fica enquanto for candidata", () => {
    const r = resultado("deterministico", [{ obra: "lluvia", probabilidade: 1 }, { obra: "curves", probabilidade: 0 }], "lluvia");
    assert.deepEqual(manterAoTocar(sel("curves"), r), sel("curves"));
  });
  test("sai das candidatas: entra a escolha", () => {
    const r = resultado("deterministico", [{ obra: "lluvia", probabilidade: 1 }], "lluvia");
    assert.deepEqual(manterAoTocar(sel("curves"), r), { obra: "lluvia", origem: "criterio" });
    assert.deepEqual(manterAoTocar(null, r), { obra: "lluvia", origem: "criterio" });
  });
  test("no sorteio vale a mesma regra de antes", () => {
    const r = resultado("uniforme", [{ obra: "lluvia", probabilidade: 1 }, { obra: "curves", probabilidade: 0 }], "lluvia");
    assert.deepEqual(manterAoTocar(sel("curves"), r), { obra: "lluvia", origem: "criterio" });
    assert.deepEqual(manterAoTocar(sel("lluvia", "manual"), r), sel("lluvia", "manual"));
  });
});

describe("origem da escolha", () => {
  test("os três textos e nenhum", () => {
    assert.equal(origemDaEscolha({ tipo: "sorteio", probabilidade: 0.3 }), "por sorteio");
    assert.equal(origemDaEscolha({ tipo: "rodizio" }), "por rodízio");
    assert.equal(origemDaEscolha({ tipo: "manual" }), "à mão");
    assert.equal(origemDaEscolha({ tipo: "nenhuma" }), null);
  });
});
