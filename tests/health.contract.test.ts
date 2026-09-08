/**
 * Contrato do /api/health (T25, OPS-04): cada modo de falha das fontes tem que
 * aparecer como degraded com o motivo — nunca como ok silencioso.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { GET } from "@/app/api/health/route";

let fetchOriginal: typeof globalThis.fetch;
let envOriginal: Record<string, string | undefined>;

beforeEach(() => {
  fetchOriginal = globalThis.fetch;
  envOriginal = {
    SATELLITE_API_URL: process.env.SATELLITE_API_URL,
    SATELLITE_API_KEY: process.env.SATELLITE_API_KEY,
  };
  process.env.SATELLITE_API_URL = "https://exemplo.execute-api.sa-east-1.amazonaws.com/prod";
  process.env.SATELLITE_API_KEY = "chave-de-teste";
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  for (const [k, v] of Object.entries(envOriginal)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function responder(fn: (url: string) => Response | never) {
  globalThis.fetch = (async (url: string | URL | Request) =>
    fn(String(url))) as typeof globalThis.fetch;
}

describe("T25 — /api/health", () => {
  test("fontes saudáveis → 200 ok", async () => {
    responder(() => new Response(JSON.stringify({ count: 0 }), { status: 200 }));
    const res = await GET();
    assert.equal(res.status, 200);
    const corpo = await res.json();
    assert.equal(corpo.status, "ok");
    assert.equal(corpo.sources.fire.status, "ok");
    assert.equal(corpo.sources.lightning.status, "ok");
  });

  test("chave inválida (403) → degraded com o status no detalhe", async () => {
    responder(() => new Response("forbidden", { status: 403 }));
    const res = await GET();
    assert.equal(res.status, 503);
    const corpo = await res.json();
    assert.equal(corpo.status, "degraded");
    assert.match(corpo.sources.fire.detail, /403/);
  });

  test("uma fonte fora → geral degraded, a outra segue ok", async () => {
    responder((url) =>
      url.includes("/lightning")
        ? new Response("erro", { status: 500 })
        : new Response(JSON.stringify({ count: 2 }), { status: 200 }),
    );
    const corpo = await (await GET()).json();
    assert.equal(corpo.status, "degraded");
    assert.equal(corpo.sources.fire.status, "ok");
    assert.equal(corpo.sources.lightning.status, "degraded");
  });

  test("falha de rede → degraded, não exceção", async () => {
    responder(() => {
      throw new Error("ECONNREFUSED");
    });
    const res = await GET();
    assert.equal(res.status, 503);
  });

  test("env ausente → degraded dizendo qual é o problema", async () => {
    delete process.env.SATELLITE_API_KEY;
    responder(() => new Response(JSON.stringify({ count: 0 }), { status: 200 }));
    const corpo = await (await GET()).json();
    assert.equal(corpo.status, "degraded");
    assert.match(corpo.sources.fire.detail, /SATELLITE_API/);
  });
});
