import type { ComponentType } from "react";

import Composition from "./composition";
import CompositionControls from "./composition-controls";
import DebugPanel from "@/components/debug-panel/debug-panel";
import { collect, resolveAudio } from "./composition-data";
import type {
  CompositionManifest,
  CompositionRuntimeProps,
} from "./composition-data";

export type {
  AudioStep,
  CompositionAudio,
  CompositionManifest,
  CompositionRuntimeProps,
} from "./composition-data";
export { canonicalAttribute, resolveAudio } from "./composition-data";

/**
 * Monta a animação declarada. Chamado pelo registro gerado, nunca à mão.
 */
export function createComposition(
  manifest: CompositionManifest,
  /**
   * O sketch declara as props que quer — `{ temperature, rain, play }` — e o
   * runtime as monta a partir do manifesto, em tempo de execução. O TypeScript
   * não tem como ligar as duas pontas: os nomes vêm de um JSON.
   *
   * Quem verifica esse contrato é `npm run compositions:validate`, que recusa
   * um atributo que não existe e sugere a grafia certa. É a mesma divisão de
   * trabalho dos patches, onde o canal `gaia.*` também é validado por script e
   * não pelo compilador.
   */
  Sketch: ComponentType<any>,
) {
  return async function DeclaredComposition(props: CompositionRuntimeProps) {
    const valores = await collect(manifest.attributes, props);
    const audio = resolveAudio(manifest.audio, valores);

    return (
      <Composition>
        <Sketch
          key={props.refresh ?? "default"}
          {...valores}
          play={props.play}
        />
        <CompositionControls
          play={props.play}
          mp3={manifest.audio.kind === "mp3"}
          patchPath={audio}
        />
        <DebugPanel data={[valores]} />
      </Composition>
    );
  };
}
