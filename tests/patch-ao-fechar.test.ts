/**
 * Contrato da decisão de áudio ao fechar uma obra.
 *
 * O bug que motivou este módulo: fechar a obra enquanto o patch Pd ainda
 * inicializava deixava o som órfão — o visual fechava, o patch terminava de
 * nascer e ficava tocando sem controle. A decisão aqui tem de enxergar o patch
 * "carregando" com o mesmo peso do patch "ativo".
 *
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { decidirPatchAoFechar } from "../app/[locale]/map3/patch-ao-fechar";
import type { Map3Pd4WebPatch } from "../app/[locale]/map3/pd4web-patches";

function patchDeObra(): Map3Pd4WebPatch {
  return {
    id: "bubble1",
    label: "Bubble 1",
    bundleFolder: "patches/bubble1",
    activation: { moments: [], compositions: ["lluvia"] },
    channels: { receivers: {} },
  } as unknown as Map3Pd4WebPatch;
}

function patchDoMapa(): Map3Pd4WebPatch {
  return {
    id: "paraisoGaia43",
    label: "Map sound 43",
    bundleFolder: "patches/paraisoGaia43",
    activation: { moments: ["map"], compositions: [] },
    channels: { receivers: {} },
  } as unknown as Map3Pd4WebPatch;
}

describe("decidirPatchAoFechar", () => {
  test("obra sem patch (mp3/none): nada a parar; restaura o mapa se pedido", () => {
    const decisao = decidirPatchAoFechar(
      { ativo: null, carregando: null },
      { restaurarPatchDoMapa: true },
    );
    assert.deepEqual(decisao, { parar: false, restaurarMapa: true });
  });

  test("patch da obra tocando: para, e restaura o mapa se pedido", () => {
    const decisao = decidirPatchAoFechar(
      { ativo: patchDeObra(), carregando: null },
      { restaurarPatchDoMapa: true },
    );
    assert.deepEqual(decisao, { parar: true, restaurarMapa: true });
  });

  /**
   * O caso do bug: ENTER/clique para encerrar a obra segundos depois de
   * abri-la, com o wasm ainda baixando. `ativo` é null, mas há um patch a
   * caminho — a decisão antiga via só o `ativo` e pulava o stop.
   */
  test("patch da obra ainda carregando: para mesmo sem patch ativo", () => {
    const decisao = decidirPatchAoFechar(
      { ativo: null, carregando: patchDeObra() },
      { restaurarPatchDoMapa: false },
    );
    assert.equal(decisao.parar, true);
  });

  test("obra keepMapPatch (patch do mapa tocando): não derruba o som do mapa", () => {
    const decisao = decidirPatchAoFechar(
      { ativo: patchDoMapa(), carregando: null },
      { restaurarPatchDoMapa: true },
    );
    assert.deepEqual(decisao, { parar: false, restaurarMapa: false });
  });

  test("patch do mapa ainda carregando: não para nem religa em dobro", () => {
    const decisao = decidirPatchAoFechar(
      { ativo: null, carregando: patchDoMapa() },
      { restaurarPatchDoMapa: true },
    );
    assert.deepEqual(decisao, { parar: false, restaurarMapa: false });
  });

  test("sem pedido de restauração, só decide a parada", () => {
    const decisao = decidirPatchAoFechar(
      { ativo: patchDeObra(), carregando: null },
      { restaurarPatchDoMapa: false },
    );
    assert.deepEqual(decisao, { parar: true, restaurarMapa: false });
  });
});
