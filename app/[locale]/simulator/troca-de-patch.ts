/**
 * Qual patch Pd deve tocar para a obra em cena e o que fazer para chegar nele.
 */
import type { DeclaredCompositionName } from "@/components/compositions/compositions-declared.generated";
import type { CompositionManifest } from "@/components/compositions/composition-audio";
import { getPatchIdForComposition } from "../map3/pd4web-patches";

/** Obras que mantêm o patch do mapa tocando usam "mapa15". */
export function patchDaObra(obra: DeclaredCompositionName, manifest: CompositionManifest): string | null {
  if (manifest.keepMapPatch) return "mapa15";
  return getPatchIdForComposition(obra) ?? null;
}

export function decidirAcaoDePatch(e: {
  desejado: string | null;
  ativo: string | null;
  carregando: boolean;
  parando: boolean;
}): "esperar" | "parar" | "iniciar" | "nada" {
  if (e.carregando || e.parando) return "esperar";
  if (e.ativo === e.desejado) return "nada";
  if (e.ativo !== null) return "parar";
  if (e.desejado !== null) return "iniciar";
  return "nada";
}
