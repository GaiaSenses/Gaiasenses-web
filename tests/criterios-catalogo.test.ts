import assert from "node:assert/strict";
import { test } from "node:test";

import { catalogoHabilitado } from "../lib/criterios/catalogo";
import estudo from "./fixtures/estudo-dados.cjs";

test("catálogo tem as 23 habilitadas e não tem exemploClima", () => {
  const ids = catalogoHabilitado().map((obra) => obra.id);
  assert.equal(ids.length, 23);
  assert.equal(new Set(ids).size, 23);
  assert.ok(!(ids as string[]).includes("exemploClima"));
});

test("catálogo bate com o do estudo", () => {
  // Se falhar, alguma obra mudou desde o estudo e a referência dos testes
  // B/C/D precisa ser revista.
  const porId = <T extends { id: string }>(lista: readonly T[]) =>
    [...lista].sort((a, b) => a.id.localeCompare(b.id));
  const atual = porId(catalogoHabilitado()).map(({ id, attributes }) => ({
    id,
    attributes: [...attributes],
  }));
  const referencia = porId(estudo.catalogo).map(({ id, attributes }) => ({
    id,
    attributes: [...attributes],
  }));
  assert.deepEqual(atual, referencia);
});
