import {
  DECLARED_COMPOSITIONS,
  DECLARED_COMPOSITION_MANIFESTS,
  type DeclaredCompositionName,
} from "./compositions-declared.generated";
import type { CompositionManifest } from "./composition-runtime";

/**
 * O catálogo de animações.
 *
 * Este arquivo era a lista mantida à mão: 23 imports, duas uniões de tipo e um
 * objeto com 23 entradas, cada uma apontando para um wrapper React escrito só
 * para ela. Agora é o que sobrou disso — acessores sobre o registro gerado a
 * partir de `compositions/<slug>/composition.json`.
 *
 * Acrescentar uma animação não passa mais por aqui. Nada passa mais por aqui.
 */
export type AvailableCompositionNames = DeclaredCompositionName;

export type CompositionInfo = {
  name: string;
  attributes: string[];
  /**
   * A função assíncrona que o `page.tsx` chama com lat, lon, today e play. Vem
   * do `composition-runtime`, montada a partir do manifesto — nenhuma animação
   * traz a sua.
   */
  Component: (typeof DECLARED_COMPOSITIONS)[DeclaredCompositionName];
  /**
   * Campo herdado do catálogo antigo. Nenhuma animação o lê; fica aqui só
   * porque quem consome ainda espera a forma completa.
   */
  endpoints: string[];
  thumb: string;
  author?: string;
  openProcessingLink?: string;
  keepMapPatch?: boolean;
};

export type CompositionsInfoType = {
  [K in AvailableCompositionNames]: CompositionInfo;
};

const manifestos = Object.entries(DECLARED_COMPOSITION_MANIFESTS) as [
  DeclaredCompositionName,
  CompositionManifest,
][];

const CompositionsInfo = {} as CompositionsInfoType;

for (const [nome, manifest] of manifestos) {
  CompositionsInfo[nome] = {
    name: nome,
    attributes: [...manifest.attributes],
    Component: DECLARED_COMPOSITIONS[nome],
    endpoints: [],
    thumb: manifest.thumb,
    author: manifest.author,
    openProcessingLink: manifest.openProcessingLink,
    keepMapPatch: manifest.keepMapPatch,
  };
}

export default CompositionsInfo;
