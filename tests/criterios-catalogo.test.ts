/**
 * Catálogo das obras habilitadas: só invariantes. A lista e os atributos de cada obra são dados
 * que quem contribui edita (manifestos e `OBRAS_HABILITADAS`); o teste não guarda uma cópia deles.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { CompositionManifest } from "@/components/compositions/composition-audio";
import { DECLARED_COMPOSITION_MANIFESTS } from "@/components/compositions/compositions-manifests.generated";
import { OBRAS_HABILITADAS } from "@/components/compositions/obras-habilitadas";
import { catalogoHabilitado } from "../lib/criterios/catalogo";

const manifestos = DECLARED_COMPOSITION_MANIFESTS as unknown as Record<string, CompositionManifest>;

test("o catálogo não tem o exemploClima", () => {
  assert.ok(!(catalogoHabilitado().map((obra) => obra.id) as string[]).includes("exemploClima"));
});

test("toda obra habilitada tem manifesto", () => {
  for (const id of OBRAS_HABILITADAS) {
    assert.ok(Object.prototype.hasOwnProperty.call(manifestos, id), id);
  }
});

test("a ordem é a dos manifestos, filtrada pelas habilitadas", () => {
  const esperada = Object.values(manifestos)
    .map((manifesto) => manifesto.id)
    .filter((id) => OBRAS_HABILITADAS.has(id));
  assert.deepEqual(catalogoHabilitado().map((obra) => obra.id), esperada);
});

test("rótulo e atributos vêm do manifesto", () => {
  for (const obra of catalogoHabilitado()) {
    const manifesto = manifestos[obra.id];
    assert.equal(obra.label, manifesto.label, obra.id);
    assert.deepEqual([...obra.attributes], [...manifesto.attributes], obra.id);
  }
});
