/**
 * Contract tests for the satellite data layer.
 *
 * Every case here corresponds to a defect that actually shipped, so the suite is
 * a record of what went wrong as much as a guard against it happening again. The
 * ID in each name points at the report item.
 *
 * The layer is exercised through a stubbed global fetch rather than the network.
 * That is deliberate: the contract being tested is what this module does with an
 * answer, and the interesting answers are the ones a live backend will not give
 * on demand — a 500, a refused connection, an unset environment.
 *
 * Run with: npm test
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import getData, {
  getFireSpots,
  getLightning,
  reverseGeocode,
} from "@/components/getData";

const BASE = "https://exemplo.execute-api.sa-east-1.amazonaws.com/prod";

type ChamadaFetch = { url: string; init?: RequestInit & { next?: unknown } };

let chamadas: ChamadaFetch[] = [];
let fetchOriginal: typeof globalThis.fetch;
let envOriginal: string | undefined;
let chaveOriginal: string | undefined;

/** Substitui o fetch global e devolve o que o teste pedir. */
function responderCom(resposta: () => Promise<Response> | never) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init });
    return resposta();
  }) as typeof globalThis.fetch;
}

const ok = (corpo: unknown) => () =>
  Promise.resolve(
    new Response(JSON.stringify(corpo), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

const status = (codigo: number, texto = "") => () =>
  Promise.resolve(new Response(texto, { status: codigo }));

const explodir = (mensagem: string) => () => {
  throw new Error(mensagem);
};

beforeEach(() => {
  chamadas = [];
  fetchOriginal = globalThis.fetch;
  envOriginal = process.env.SATELLITE_API_URL;
  chaveOriginal = process.env.OPEN_WEATHER_API_KEY;
  process.env.SATELLITE_API_URL = BASE;
  process.env.OPEN_WEATHER_API_KEY = "chave-de-teste";
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  if (envOriginal === undefined) delete process.env.SATELLITE_API_URL;
  else process.env.SATELLITE_API_URL = envOriginal;
  if (chaveOriginal === undefined) delete process.env.OPEN_WEATHER_API_KEY;
  else process.env.OPEN_WEATHER_API_KEY = chaveOriginal;
});

describe("BUG-02 — uma queda não pode passar por céu calmo", () => {
  test("resposta não-2xx devolve null, não undefined e não exceção", async () => {
    responderCom(status(500, "Internal Server Error"));
    const resultado = await getData("lightning", "-23.55", "-46.63", 100);
    assert.equal(resultado, null);
  });

  test("erro de rede devolve null em vez de propagar", async () => {
    responderCom(explodir("ECONNREFUSED"));
    const resultado = await getData("fire", "-23.55", "-46.63", 100);
    assert.equal(resultado, null);
  });

  test("getLightning propaga o null — nada de mock com count: 1", async () => {
    responderCom(status(503));
    const resultado = await getLightning("-23.55", "-46.63", 100);
    assert.equal(
      resultado,
      null,
      "o catch antigo devolvia { count: 1, state: 'This is mock data...' }",
    );
  });

  test("getFireSpots propaga o null", async () => {
    responderCom(explodir("timeout"));
    assert.equal(await getFireSpots("-23.55", "-46.63", 100), null);
  });

  test("zero é zero, e é diferente de null", async () => {
    responderCom(ok({ city: "São Paulo", state: "SP", count: 0, events: [] }));
    const resultado = await getLightning("-23.55", "-46.63", 100);
    assert.notEqual(resultado, null, "céu calmo não é fonte indisponível");
    assert.equal(resultado?.count, 0);
  });

  test("uma resposta boa chega intacta a quem chamou", async () => {
    const corpo = {
      city: "Salvador",
      state: "BA",
      count: 3,
      events: [{ dist: 12.5, lat: -12.9, lon: -38.5 }],
    };
    responderCom(ok(corpo));
    assert.deepEqual(await getFireSpots("-12.97", "-38.50", 100), corpo);
  });
});

describe("ARQ-01 — sem a variável, a fonte é indisponível e ninguém sai para a rede", () => {
  test("SATELLITE_API_URL ausente devolve null", async () => {
    delete process.env.SATELLITE_API_URL;
    responderCom(ok({ count: 99 }));
    assert.equal(await getData("fire", "-23.55", "-46.63"), null);
  });

  test("e não chega a fazer a requisição", async () => {
    delete process.env.SATELLITE_API_URL;
    responderCom(ok({ count: 99 }));
    await getData("fire", "-23.55", "-46.63");
    assert.equal(chamadas.length, 0, "não deve tentar buscar sem saber o destino");
  });

  test("string vazia conta como ausente", async () => {
    process.env.SATELLITE_API_URL = "   ";
    responderCom(ok({ count: 1 }));
    assert.equal(await getData("fire", "-23.55", "-46.63"), null);
  });
});

describe("HIG-09 — a coordenada é a chave do cache", () => {
  test("coordenadas são arredondadas a 2 casas na URL", async () => {
    responderCom(ok({}));
    await getData("fire", "-23.5528381", "-46.6621533", 100);
    const url = new URL(chamadas[0].url);
    assert.equal(url.searchParams.get("lat"), "-23.55");
    assert.equal(url.searchParams.get("lon"), "-46.66");
  });

  test("posições a poucos metros produzem a MESMA URL", async () => {
    responderCom(ok({}));
    await getData("lightning", "-23.5528381", "-46.6621533", 100);
    await getData("lightning", "-23.5529500", "-46.6620500", 100);
    assert.equal(
      chamadas[0].url,
      chamadas[1].url,
      "URLs distintas viram entradas de cache distintas, e o revalidate deixa de valer",
    );
  });

  test("o revalidate de 2 h vai junto", async () => {
    responderCom(ok({}));
    await getData("fire", "-23.55", "-46.63", 100);
    assert.deepEqual(chamadas[0].init?.next, { revalidate: 7200 });
  });

  test("barra final na variável não vira barra dupla", async () => {
    process.env.SATELLITE_API_URL = `${BASE}///`;
    responderCom(ok({}));
    await getData("fire", "-23.55", "-46.63");
    assert.ok(
      !chamadas[0].url.replace("https://", "").includes("//"),
      `URL malformada: ${chamadas[0].url}`,
    );
  });

  test("dist só aparece quando é informado", async () => {
    responderCom(ok({}));
    await getData("fire", "-23.55", "-46.63");
    assert.equal(new URL(chamadas[0].url).searchParams.has("dist"), false);

    await getData("fire", "-23.55", "-46.63", 100);
    assert.equal(new URL(chamadas[1].url).searchParams.get("dist"), "100");
  });
});

describe("HIG-09 — geocoding reverso", () => {
  test("usa https: a chave da API viaja na URL", async () => {
    responderCom(ok([{ name: "São Paulo", lat: -23.55, lon: -46.63 }]));
    await reverseGeocode("-23.55", "-46.63");
    assert.ok(
      chamadas[0].url.startsWith("https://"),
      `em texto claro a OPEN_WEATHER_API_KEY é legível no caminho: ${chamadas[0].url}`,
    );
  });

  test("arredonda a coordenada e cacheia por 24 h", async () => {
    responderCom(ok([{ name: "São Paulo" }]));
    await reverseGeocode("-23.5528381", "-46.6621533");
    const url = new URL(chamadas[0].url);
    assert.equal(url.searchParams.get("lat"), "-23.55");
    assert.equal(url.searchParams.get("lon"), "-46.66");
    assert.deepEqual(chamadas[0].init?.next, { revalidate: 86400 });
  });

  test("falha devolve null", async () => {
    responderCom(status(401, "Invalid API key"));
    assert.equal(await reverseGeocode("-23.55", "-46.63"), null);
  });
});
