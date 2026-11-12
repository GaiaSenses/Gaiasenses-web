import type { Map3Pd4WebPatch } from "./pd4web-patches";

export type EstadoDoPatch = {
  /** Patch já inicializado e tocando. */
  ativo: Map3Pd4WebPatch | null;
  /** Patch ainda nascendo (fetch do wasm + worklet); exposto por `startPatch`. */
  carregando: Map3Pd4WebPatch | null;
};

export type DecisaoAoFechar = {
  /** Derrubar o patch corrente (tocando OU carregando). */
  parar: boolean;
  /** Religar a paisagem sonora do mapa depois de fechar a obra. */
  restaurarMapa: boolean;
};

function ehDoMapa(patch: Map3Pd4WebPatch | null): boolean {
  return Boolean(patch?.activation.moments.includes("map"));
}

/**
 * O que fazer com o áudio Pd quando a obra fecha.
 *
 * A regra precisa valer também DURANTE a inicialização: o patch de uma obra
 * leva segundos para carregar (wasm + worklet) e, nessa janela, `activePatch`
 * ainda é null. A versão antiga decidia só por ele — fechar a obra cedo pulava
 * o stop em silêncio, o visual ia embora e o patch terminava de nascer sem
 * ninguém para pará-lo, tocando órfão sobre o mapa. Obras mp3 nunca sofreram
 * disso porque o desmonte do Player faz o fade por conta própria.
 */
export function decidirPatchAoFechar(
  estado: EstadoDoPatch,
  opcoes: { restaurarPatchDoMapa: boolean },
): DecisaoAoFechar {
  const corrente = estado.ativo ?? estado.carregando;
  const correnteEhDoMapa = ehDoMapa(corrente);

  return {
    parar: corrente !== null && !correnteEhDoMapa,
    // Se o corrente já é o patch do mapa (tocando ou carregando), religar
    // seria duplicá-lo; nos demais casos o chamador decide se quer a volta.
    restaurarMapa: opcoes.restaurarPatchDoMapa && !correnteEhDoMapa,
  };
}
