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
  getWeather,
  reverseGeocode,
} from "@/components/getData";

const BASE = "https://exemplo.execute-api.sa-east-1.amazonaws.com/prod";

type ChamadaFetch = { url: string; init?: RequestInit & { next?: unknown } };

let chamadas: ChamadaFetch[] = [];
let fetchOriginal: typeof globalThis.fetch;
let envOriginal: string | undefined;
let chaveOriginal: string | undefined;
let chaveSatelite: string | undefined;
let chavePublica: string | undefined;

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
  chaveSatelite = process.env.SATELLITE_API_KEY;
  chavePublica = process.env.SATELLITE_API_KEY_PUBLIC;
  process.env.SATELLITE_API_URL = BASE;
  process.env.OPEN_WEATHER_API_KEY = "chave-de-teste";
});

const restaurar = (nome: string, valor: string | undefined) => {
  if (valor === undefined) delete process.env[nome];
  else process.env[nome] = valor;
};

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  restaurar("SATELLITE_API_URL", envOriginal);
  restaurar("OPEN_WEATHER_API_KEY", chaveOriginal);
  restaurar("SATELLITE_API_KEY", chaveSatelite);
  restaurar("SATELLITE_API_KEY_PUBLIC", chavePublica);
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

describe("BUG-02 — clima também não se fabrica", () => {
  /**
   * O catch de getOpenMeteo devolvia um objeto inteiro de clima inventado —
   * temp 24, vento 30, umidade 30 — com description "indisponível" como único
   * aviso. Uma queda da Open-Meteo virava um dia ameno em São Paulo, inclusive
   * para a API pública e para o registro de pesquisa. O mesmo princípio dos
   * raios vale para o clima: indisponível é null, nunca um número plausível.
   */
  test("getWeather devolve null quando a Open-Meteo não responde", async () => {
    responderCom(explodir("ENOTFOUND api.open-meteo.com"));
    const resultado = await getWeather("-23.55", "-46.63");
    assert.equal(
      resultado,
      null,
      "o catch antigo devolvia temp 24 °C e vento 30 m/s fabricados",
    );
  });

  test("getWeather devolve null com resposta não-2xx", async () => {
    responderCom(status(500, "Internal Server Error"));
    assert.equal(await getWeather("-23.55", "-46.63"), null);
  });

  /**
   * Achado da revisão, verificado ao vivo: o exemplo da Open-Meteo soma
   * utcOffsetSeconds ao epoch para EXIBIR hora local, e toISOString() em cima
   * disso produzia hora local com sufixo Z — um observedAt falso pelo offset
   * (−3 h em São Paulo) em toda resposta saudável da API pública.
   */
  test("o instante observado é epoch UTC puro, sem somar offset de fuso", async () => {
    const { montarCurrent } = await import("@/components/getOpenMeteo");
    const atual = montarCurrent(Array(15).fill(0), 1_760_000_000);
    assert.equal(
      atual.time.toISOString(),
      new Date(1_760_000_000 * 1000).toISOString(),
    );
  });

  test("o shape legado sai do dado real, campo a campo", async () => {
    const { toRainfallResponse } = await import("@/components/getData");
    const resultado = toRainfallResponse({
      lat: -23.55,
      lon: -46.66,
      current: {
        time: new Date("2026-10-08T17:45:00Z"),
        temperature2m: 24.3456,
        relativeHumidity2m: 71,
        apparentTemperature: 26.1234,
        precipitation: 0.2,
        rain: 0.1,
        showers: 0,
        snowfall: 0,
        weatherCode: 61,
        cloudCover: 40.26,
        windSpeed10m: 11.248,
        windDirection10m: 130.44,
        windGusts10m: 24.57,
        surfacePressure: 932.4,
        pressureMsl: 1013.2,
        isDay: 1,
      },
    });

    assert.equal(resultado.main.temp, 24.3);
    assert.equal(resultado.main.feels_like, 26.1);
    assert.equal(resultado.main.humidity, 71);
    assert.equal(resultado.main.pressure, 932.4);
    assert.equal(resultado.clouds, 40.3);
    assert.deepEqual(resultado.wind, { deg: 130.4, gust: 24.6, speed: 11.2 });
    // A cadeia showers || rain || precipitation é a do código em produção:
    // showers 0 é falsy, então vale o rain.
    assert.deepEqual(resultado.rain, { "1h": 0.1 });
    assert.equal(resultado.lat, -23.55);
    assert.equal(resultado.lon, -46.66);
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

describe("API pública — credencial própria, timeout e /rain", () => {
  /**
   * O tráfego da rota pública /api/v1 sai com uma chave própria, num usage
   * plan próprio na AWS: abuso público esgota a cota pública e vira 429 sem
   * nunca dividir os 50k/mês do mapa. Fallback silencioso para a chave do
   * site reabriria exatamente a cota compartilhada que o HIG-03 fechou.
   */
  test("credential public manda a SATELLITE_API_KEY_PUBLIC", async () => {
    process.env.SATELLITE_API_KEY = "chave-do-site";
    process.env.SATELLITE_API_KEY_PUBLIC = "chave-publica";
    responderCom(ok({ count: 0, events: [] }));

    await getData("fire", "-23.55", "-46.63", 100, { credential: "public" });

    const enviados = new Headers(
      (chamadas[0].init?.headers as HeadersInit) ?? {},
    );
    assert.equal(enviados.get("x-api-key"), "chave-publica");
  });

  test("sem a chave pública não há fallback para a chave do site", async () => {
    process.env.SATELLITE_API_KEY = "chave-do-site";
    delete process.env.SATELLITE_API_KEY_PUBLIC;
    responderCom(ok({ count: 0, events: [] }));

    await getData("fire", "-23.55", "-46.63", 100, { credential: "public" });

    const enviados = new Headers(
      (chamadas[0].init?.headers as HeadersInit) ?? {},
    );
    assert.equal(
      enviados.get("x-api-key"),
      null,
      "fallback silencioso faria o público consumir a cota do mapa",
    );
  });

  test("sem opts, a chave continua sendo a do site", async () => {
    process.env.SATELLITE_API_KEY = "chave-do-site";
    process.env.SATELLITE_API_KEY_PUBLIC = "chave-publica";
    responderCom(ok({ count: 0, events: [] }));

    await getData("fire", "-23.55", "-46.63", 100);

    const enviados = new Headers(
      (chamadas[0].init?.headers as HeadersInit) ?? {},
    );
    assert.equal(enviados.get("x-api-key"), "chave-do-site");
  });

  test("timeoutMs vira um AbortSignal no fetch", async () => {
    responderCom(ok({ count: 0, events: [] }));
    await getData("lightning", "-23.55", "-46.63", 100, { timeoutMs: 20_000 });
    assert.ok(
      chamadas[0].init?.signal instanceof AbortSignal,
      "sem signal, um backend pendurado segura a resposta da rota pública",
    );
  });

  test("getRain consulta /rain e devolve a taxa como veio", async () => {
    const { getRain } = await import("@/components/getData");
    responderCom(ok({ count: 1.8 }));

    const resultado = await getRain("-23.5528381", "-46.6621533");

    assert.equal(resultado?.count, 1.8);
    const url = new URL(chamadas[0].url);
    assert.ok(url.pathname.endsWith("/rain"), `caminho errado: ${url.pathname}`);
    assert.equal(url.searchParams.get("lat"), "-23.55");
  });

  test("getRain devolve null quando o backend falha", async () => {
    const { getRain } = await import("@/components/getData");
    responderCom(status(501, "Error downloading rain data"));
    assert.equal(await getRain("-23.55", "-46.63"), null);
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

  /**
   * A chave do nosso API Gateway não pode vazar para a OpenWeather. Não é só
   * higiene: ela responde 401 e ignora o `appid` quando recebe um `x-api-key`,
   * então o nome do lugar simplesmente para de resolver.
   *
   * Foi o que aconteceu ao acrescentar a chave — os dois `fetch` deste arquivo
   * foram tratados como se ambos fossem do satélite, e só um é. Ficou em
   * produção porque o sintoma é discreto: o painel mostra vírgula e nada mais,
   * e nenhum status de erro aparece.
   */
  test("não manda a chave do satélite para a OpenWeather", async () => {
    process.env.SATELLITE_API_KEY = "chave-do-gateway";
    responderCom(ok([{ name: "São Paulo" }]));

    await reverseGeocode("-23.55", "-46.63");

    const enviados = new Headers(
      (chamadas[0].init?.headers as HeadersInit) ?? {},
    );
    assert.equal(
      enviados.get("x-api-key"),
      null,
      "a chave do API Gateway foi enviada para um serviço de terceiro",
    );
  });
});
