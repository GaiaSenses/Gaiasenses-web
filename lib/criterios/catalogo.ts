/**
 * Catálogo puro das obras habilitadas, na ordem dos manifestos.
 * Só dados: não carrega React nem os sketches (.tsx).
 */
import { DECLARED_COMPOSITION_MANIFESTS } from "@/components/compositions/compositions-manifests.generated";
import { OBRAS_HABILITADAS } from "@/components/compositions/obras-habilitadas";
import type { ObraDoCatalogo } from "./tipos";

export function catalogoHabilitado(): readonly ObraDoCatalogo[] {
  return Object.values(DECLARED_COMPOSITION_MANIFESTS)
    .filter((manifesto) => OBRAS_HABILITADAS.has(manifesto.id))
    .map(({ id, label, attributes }) => ({ id, label, attributes }));
}
