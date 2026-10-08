/**
 * Contrato da API pública GET /api/v1/now (e do índice /api/v1).
 *
 * A rota antiga /api/satellite foi removida no HIG-03 por três defeitos: proxy
 * aberto, amplificação 1→N para um backend caro, e rate limit em memória que
 * não limitava nada. Estes testes pinam o que a substituta promete: validação
 * antes de qualquer rede, credencial pública (nunca a do site), degradação por
 * fonte com null — jamais dado fabricado —, timeout que responde em vez de
 * pendurar, e os headers de CORS e cache que fazem a CDN absorver o tráfego.
 *
 * Como nos demais contratos, o fetch global é stubado: as respostas
 * interessantes (500, 501, pendurada, chave ausente) não saem de um backend
 * vivo sob demanda. O caminho feliz do CLIMA não aparece aqui — a Open-Meteo
 * responde flatbuffers, impraticável de stubar — e é coberto pelo mapeador
 * puro mapOpenMeteoCurrent, testado direto.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { GET, OPTIONS } from "@/app/api/v1/now/route";
import {
  cacheControlFor,
  mapFireEvents,
  mapLightningEvents,
  mapOpenMeteoCurrent,
  mapRain,
} from "@/app/api/v1/now/mappers";
import { GET as getIndex } from "@/app/api/v1/route";

const BASE = "https://exemplo.execute-api.sa-east-1.amazonaws.com/prod";
const NOW = "http://localhost/api/v1/now";

type ChamadaFetch = { url: string; init?: RequestInit };

let chamadas: ChamadaFetch[] = [];
let fetchOriginal: typeof globalThis.fetch;
let envOriginal: Record<string, string | undefined>;

const ENVS = [
  "SATELLITE_API_URL",
  "SATELLITE_API_KEY",
  "SATELLITE_API_KEY_PUBLIC",
  "OPEN_WEATHER_API_KEY",
  "API_V1_TIMEOUT_SATELLITE_MS",
  "API_V1_TIMEOUT_WEATHER_MS",
];

beforeEach(() => {
  chamadas = [];
  fetchOriginal = globalThis.fetch;
  envOriginal = Object.fromEntries(ENVS.map((e) => [e, process.env[e]]));
  process.env.SATELLITE_API_URL = BASE;
  process.env.SATELLITE_API_KEY = "chave-do-site";
  process.env.SATELLITE_API_KEY_PUBLIC = "chave-publica";
  process.env.OPEN_WEATHER_API_KEY = "chave-de-teste";
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  for (const [k, v] of Object.entries(envOriginal)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** Roteia o stub por trecho da URL; o default responde cada fonte saudável. */
function responder(fn: (url: string) => Response | Promise<Response> | never) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init });
    return fn(String(url));
  }) as typeof globalThis.fetch;
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Payloads como o backend AWS responde HOJE — não como os tipos legados dizem. */
const FIRE = { count: 1, events: [{ latitude: -23.49, longitude: -46.6, bright_ti4: 331.2 }] };
const LIGHTNING = {
  count: 2,
  events: [
    { latitude: -23.51, longitude: -46.71, "energy (pJ)": 1234.5 },
    { latitude: -23.6, longitude: -46.58, "energy (pJ)": 310.2 },
  ],
};
const RAIN = { count: 1.8 };
const GEO = [{ name: "São Paulo", state: "São Paulo", country: "BR", lat: -23.55, lon: -46.66 }];

/** Satélite e geocode saudáveis; Open-Meteo fora (flatbuffers não se stuba). */
function fontesSaudaveis(url: string): Response | never {
  if (url.includes("open-meteo")) throw new Error("ENOTFOUND api.open-meteo.com");
  if (url.includes("openweathermap")) return json(GEO);
  if (url.includes("/fire")) return json(FIRE);
  if (url.includes("/lightning")) return json(LIGHTNING);
  if (url.includes("/rain")) return json(RAIN);
  throw new Error(`URL inesperada no teste: ${url}`);
}

describe("validação — erro de entrada não gasta rede", () => {
  for (const [caso, query] of [
    ["sem parâmetros", ""],
    ["sem lon", "?lat=-23.55"],
    ["lat não numérico", "?lat=abc&lon=-46.63"],
    ["lat fora da faixa", "?lat=91&lon=-46.63"],
    ["lon fora da faixa", "?lat=-23.55&lon=181"],
    // Achado da revisão: `?lat=&lon=...` passava — Number("") é 0 — e a API
    // respondia clima do Golfo da Guiné para um template de URL não preenchido.
    ["lat vazio", "?lat=&lon=-46.63"],
    ["lon só espaços", "?lat=-23.55&lon=%20%20"],
    ["lat hexadecimal", "?lat=0x10&lon=-46.63"],
  ] as const) {
    test(`${caso} → 400 sem nenhuma chamada`, async () => {
      responder(fontesSaudaveis);
      const res = await GET(new Request(`${NOW}${query}`));
      assert.equal(res.status, 400);
      assert.equal(chamadas.length, 0, "validação vem antes de qualquer fonte");
      const corpo = await res.json();
      assert.ok(typeof corpo.error === "string" && corpo.error.length > 0);
      assert.equal(res.headers.get("access-control-allow-origin"), "*");
      assert.equal(res.headers.get("cache-control"), "no-store");
    });
  }
});

describe("caminho feliz do satélite", () => {
  test("shape normalizado, coordenada ecoada arredondada, fontes nomeadas", async () => {
    responder(fontesSaudaveis);
    const res = await GET(
      new Request(`${NOW}?lat=-23.5528381&lon=-46.6621533`),
    );

    assert.equal(res.status, 200);
    const corpo = await res.json();

    assert.equal(corpo.version, "1.0");
    // Ecoar a coordenada já arredondada documenta a granularidade real (~1 km).
    assert.equal(corpo.location.lat, -23.55);
    assert.equal(corpo.location.lon, -46.66);
    assert.equal(corpo.location.radiusKm, 100);
    assert.equal(corpo.location.city, "São Paulo");
    assert.equal(corpo.location.state, "São Paulo");
    assert.equal(corpo.location.country, "BR");

    // O payload cru do backend ("energy (pJ)", bright_ti4, latitude) não vaza.
    assert.equal(corpo.lightning.count, 2);
    assert.deepEqual(corpo.lightning.events[0], {
      lat: -23.51,
      lon: -46.71,
      energyPj: 1234.5,
    });
    assert.equal(corpo.fire.count, 1);
    assert.deepEqual(corpo.fire.events[0], {
      lat: -23.49,
      lon: -46.6,
      brightness: 331.2,
    });
    assert.deepEqual(corpo.rainSatellite, { rateMmH: 1.8 });

    assert.equal(corpo.weather, null);
    assert.deepEqual(corpo.sources, {
      weather: "unavailable",
      rainSatellite: "ok",
      lightning: "ok",
      fire: "ok",
      geocoding: "ok",
    });
    assert.ok(typeof corpo.fetchedAt === "string");

    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    // Clima indisponível = resposta degradada: TTL curto para a volta aparecer.
    assert.match(res.headers.get("cache-control") ?? "", /s-maxage=60\b/);
  });

  test("a credencial é a pública — a chave do site nunca sai daqui", async () => {
    responder(fontesSaudaveis);
    await GET(new Request(`${NOW}?lat=-23.55&lon=-46.63`));

    const aoGateway = chamadas.filter((c) => c.url.includes("execute-api"));
    assert.ok(aoGateway.length >= 3, "fire, lightning e rain saem para o gateway");
    for (const chamada of aoGateway) {
      const enviados = new Headers((chamada.init?.headers as HeadersInit) ?? {});
      assert.equal(enviados.get("x-api-key"), "chave-publica");
    }

    const aoGeocode = chamadas.find((c) => c.url.includes("openweathermap"));
    const enviados = new Headers((aoGeocode?.init?.headers as HeadersInit) ?? {});
    assert.equal(enviados.get("x-api-key"), null);
  });
});

describe("degradação por fonte — null, nunca dado inventado", () => {
  test("uma fonte com erro vira null + unavailable; as outras seguem", async () => {
    responder((url) => {
      if (url.includes("/lightning")) return json({ error: "boom" }, 500);
      if (url.includes("/rain")) return json({ error: "sem granule" }, 501);
      return fontesSaudaveis(url);
    });
    const res = await GET(new Request(`${NOW}?lat=-23.55&lon=-46.63`));

    assert.equal(res.status, 200, "fogo respondeu: resposta parcial é dado");
    const corpo = await res.json();
    assert.equal(corpo.lightning, null);
    assert.equal(corpo.rainSatellite, null);
    assert.equal(corpo.sources.lightning, "unavailable");
    assert.equal(corpo.sources.rainSatellite, "unavailable");
    assert.equal(corpo.sources.fire, "ok");
  });

  test("zero com fonte ok é céu calmo, não indisponível", async () => {
    responder((url) => {
      if (url.includes("/lightning")) return json({ count: 0, events: [] });
      return fontesSaudaveis(url);
    });
    const corpo = await (
      await GET(new Request(`${NOW}?lat=-23.55&lon=-46.63`))
    ).json();
    assert.equal(corpo.lightning.count, 0);
    assert.equal(corpo.sources.lightning, "ok");
  });

  test("tudo fora → 503, todos null, e nenhum 24 °C de consolo", async () => {
    responder(() => {
      throw new Error("ECONNREFUSED");
    });
    const res = await GET(new Request(`${NOW}?lat=-23.55&lon=-46.63`));

    assert.equal(res.status, 503);
    const corpo = await res.json();
    assert.equal(corpo.weather, null);
    assert.equal(corpo.lightning, null);
    assert.equal(corpo.fire, null);
    assert.equal(corpo.rainSatellite, null);
    assert.equal(corpo.location.city, null);
    assert.equal(corpo.location.lat, -23.55, "a localização pedida sempre volta");
    // O fallback antigo fabricava temp 24 e description "indisponível".
    assert.ok(!JSON.stringify(corpo).includes('"temp":24'));
  });

  /**
   * Achado da revisão: um 200 fora do shape esperado não pode virar dado.
   * O /rain nunca rodou em produção — é a fonte menos provada do sistema — e
   * um {message: ...} com status 200 virava {"rateMmH": undefined} com fonte
   * "ok"; um /lightning 200 vazio virava count 0, o céu calmo fabricado que o
   * contrato proíbe.
   */
  test("/rain 200 sem count numérico degrada em vez de publicar lixo", async () => {
    responder((url) =>
      url.includes("/rain") ? json({ message: "oops" }) : fontesSaudaveis(url),
    );
    const corpo = await (
      await GET(new Request(`${NOW}?lat=-23.55&lon=-46.63`))
    ).json();
    assert.equal(corpo.rainSatellite, null);
    assert.equal(corpo.sources.rainSatellite, "unavailable");
  });

  test("/lightning 200 sem count nem events degrada em vez de zerar", async () => {
    responder((url) =>
      url.includes("/lightning") ? json({}) : fontesSaudaveis(url),
    );
    const corpo = await (
      await GET(new Request(`${NOW}?lat=-23.55&lon=-46.63`))
    ).json();
    assert.equal(corpo.lightning, null);
    assert.equal(corpo.sources.lightning, "unavailable");
  });

  test("fonte pendurada vira 'timeout' e a resposta volta assim mesmo", async () => {
    process.env.API_V1_TIMEOUT_SATELLITE_MS = "50";
    process.env.API_V1_TIMEOUT_WEATHER_MS = "50";
    responder((url) => {
      if (url.includes("/lightning")) return new Promise<Response>(() => {});
      return fontesSaudaveis(url);
    });

    const res = await GET(new Request(`${NOW}?lat=-23.55&lon=-46.63`));

    assert.equal(res.status, 200);
    const corpo = await res.json();
    assert.equal(corpo.lightning, null);
    assert.equal(corpo.sources.lightning, "timeout");
    assert.equal(corpo.sources.fire, "ok");
  });
});

describe("headers — CORS sempre, cache por estado", () => {
  test("OPTIONS responde 204 com os métodos", async () => {
    const res = await OPTIONS();
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.match(res.headers.get("access-control-allow-methods") ?? "", /GET/);
  });

  test("fontes de dados ok → s-maxage=600; dado degradado → 60", () => {
    const tudoOk = {
      weather: "ok",
      rainSatellite: "ok",
      lightning: "ok",
      fire: "ok",
      geocoding: "ok",
    } as const;
    assert.match(cacheControlFor(tudoOk), /s-maxage=600\b/);
    assert.match(cacheControlFor(tudoOk), /stale-while-revalidate=1800\b/);
    assert.match(
      cacheControlFor({ ...tudoOk, fire: "unavailable" }),
      /s-maxage=60\b/,
    );
    // Achado da revisão: geocoding fora do critério. Oceano não tem lugar
    // nomeado — a OpenWeather devolve [] para qualquer célula marítima — e
    // isso derrubava o TTL de 600 para 60 em consultas perfeitamente
    // saudáveis: 10× mais invocações queimando a cota pública à toa.
    assert.match(
      cacheControlFor({ ...tudoOk, geocoding: "unavailable" }),
      /s-maxage=600\b/,
    );
  });
});

describe("mapeadores puros — o caminho feliz que o stub não alcança", () => {
  test("mapOpenMeteoCurrent monta o bloco weather completo", () => {
    const bloco = mapOpenMeteoCurrent({
      time: new Date("2026-10-08T17:45:00.000Z"),
      temperature2m: 24.3456,
      relativeHumidity2m: 71,
      apparentTemperature: 26.149,
      precipitation: 0.2,
      rain: 0.2,
      showers: 0,
      snowfall: 0,
      weatherCode: 61,
      cloudCover: 40,
      windSpeed10m: 11.248,
      windDirection10m: 130.44,
      windGusts10m: 24.57,
      surfacePressure: 932.42,
      pressureMsl: 1013.21,
      isDay: 1,
    });

    assert.deepEqual(bloco, {
      temperature: 24.3,
      apparentTemperature: 26.1,
      humidity: 71,
      surfacePressure: 932.4,
      pressureMsl: 1013.2,
      cloudCover: 40,
      precipitation: 0.2,
      rain: 0.2,
      showers: 0,
      snowfall: 0,
      weatherCode: 61,
      wind: { speed: 11.2, direction: 130.4, gust: 24.6 },
      isDay: true,
      observedAt: "2026-10-08T17:45:00.000Z",
    });
  });

  test("mapLightningEvents aceita o payload real e também o antigo", () => {
    assert.deepEqual(
      mapLightningEvents([{ latitude: -23.51, longitude: -46.71, "energy (pJ)": 9.5 }]),
      [{ lat: -23.51, lon: -46.71, energyPj: 9.5 }],
    );
    // O shape que os tipos legados prometem, caso o backend volte a ele.
    assert.deepEqual(mapLightningEvents([{ lat: "-23.51", lon: "-46.71" }]), [
      { lat: -23.51, lon: -46.71, energyPj: null },
    ]);
    assert.deepEqual(mapLightningEvents(undefined), []);
  });

  test("mapFireEvents normaliza bright_ti4 para brightness", () => {
    assert.deepEqual(
      mapFireEvents([{ latitude: -23.49, longitude: -46.6, bright_ti4: 331.2 }]),
      [{ lat: -23.49, lon: -46.6, brightness: 331.2 }],
    );
  });

  test("mapRain traduz o count histórico para rateMmH", () => {
    assert.deepEqual(mapRain({ count: 1.8 }), { rateMmH: 1.8 });
  });

  test("mapRain sem count numérico é null, não lixo com cara de dado", () => {
    assert.equal(mapRain({ message: "oops" }), null);
    assert.equal(mapRain(null), null);
    assert.equal(mapRain({ count: "não-número" }), null);
  });
});

describe("GET /api/v1 — self-description", () => {
  test("descreve o contrato e cacheia por um dia", async () => {
    const res = await getIndex();
    assert.equal(res.status, 200);
    const corpo = await res.json();
    assert.equal(corpo.version, "1.0");
    assert.ok(corpo.endpoints["/api/v1/now"]);
    // Achado da revisão, verificado ao vivo: a Open-Meteo responde vento em
    // km/h (não m/s, a convenção que todo mundo assume) e neve em cm. Sem as
    // unidades declaradas, quem consome erra por 3,6×.
    const unidades = corpo.endpoints["/api/v1/now"].units;
    assert.equal(unidades["weather.wind"], "km/h");
    assert.equal(unidades["weather.snowfall"], "cm");
    assert.equal(unidades["rainSatellite.rateMmH"], "mm/h");
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.match(res.headers.get("cache-control") ?? "", /s-maxage=86400\b/);
  });
});
