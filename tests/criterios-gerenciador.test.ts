/**
 * Instância compartilhada do gerenciador: ordem de registro, padrão e custo.
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { gerenciador, CRITERIO_PADRAO_ID } from "@/lib/criterios/gerenciador";
import { catalogoHabilitado } from "@/lib/criterios/catalogo";
import type { ContextoDeDecisao, EntradaClima } from "@/lib/criterios/tipos";

describe("gerenciador real", () => {
  test("gerenciador real tem os 5, nesta ordem, e o padrão é atual", () => {
    assert.deepEqual(
      gerenciador.listar().map((c) => c.id),
      ["atual", "A", "B", "C", "D"],
    );
    assert.equal(CRITERIO_PADRAO_ID, "atual");
    assert.equal(gerenciador.padrao.id, "atual");
  });

  test("avaliarTodos roda os 5 em menos de 50 ms no total", () => {
    const entrada: EntradaClima = {
      temperature: 25, humidity: 70, clouds: 20, rain: 0, windSpeed: 3, windDeg: 90,
      lightningCount: 0, fireCount: 0, closeFires: 0, lat: -22.9, lon: -43.2,
    };
    const catalogo = catalogoHabilitado();
    const contexto = (): ContextoDeDecisao => ({
      catalogo, memoria: {}, normal: null, sortear: () => 0.5,
    });

    const inicio = performance.now();
    const resultados = gerenciador.avaliarTodos(entrada, contexto);
    const duracao = performance.now() - inicio;

    assert.equal(resultados.length, 5);
    assert.ok(resultados.every((r) => r.ok));
    assert.ok(duracao < 50, `levou ${duracao.toFixed(1)} ms`);
  });
});
