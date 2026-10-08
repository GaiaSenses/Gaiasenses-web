/**
 * GET /api/v1/now?lat=&lon= — a API pública de dados instantâneos.
 *
 * Sucessora da /api/satellite removida no HIG-03, desenhada contra os três
 * defeitos que derrubaram aquela rota:
 *
 * 1. A antiga era um proxy aberto na frente de um backend sem medidor. Esta
 *    sai com credencial própria ({credential: "public"}) num usage plan
 *    separado na AWS — abuso público esgota a cota pública e vira 429, sem
 *    nunca tocar a cota do mapa. Não há fallback para a chave do site.
 * 2. A antiga amplificava 1 request anônima em 3 chamadas caras. Esta herda o
 *    Data Cache por coordenada arredondada das funções de getData e ainda
 *    publica Cache-Control para a CDN da Vercel absorver repetição por URL.
 * 3. O rate limit da antiga era um objeto em memória por instância — nenhum
 *    limite. O desta fica na borda (regra WAF por IP, fora deste arquivo),
 *    onde o estado compartilhado existe de verdade.
 *
 * Contrato (pinado em tests/api-v1-now.contract.test.ts): fonte indisponível
 * é bloco null + sources.<fonte> "unavailable"|"timeout" — nunca um número
 * plausível; count 0 com fonte ok é céu calmo, diferente de null.
 */
import {
  getFireSpots,
  getLightning,
  getRain,
  reverseGeocode,
} from "@/components/getData";
import getOpenMeteo from "@/components/getOpenMeteo";
import {
  CORS,
  TIMEOUT,
  type SourceStatus,
  cacheControlFor,
  comTimeout,
  mapFireEvents,
  mapLightningEvents,
  mapOpenMeteoCurrent,
  mapRain,
  numeroOuNull,
} from "./mappers";

export const dynamic = "force-dynamic";
// O Gateway da AWS corta integrações em 29 s; com os timeouts por fonte
// abaixo, a resposta volta muito antes — isto é o teto da plataforma.
export const maxDuration = 30;

const VERSION = "1.0";

/**
 * Raio fixo, o mesmo que o mapa usa. Um `dist` livre multiplicaria a
 * cardinalidade das chaves de cache (Data Cache e CDN) e viraria vetor de
 * amplificação — cada valor distinto é uma família nova de URLs sem cache.
 */
const RADIUS_KM = 100;

/**
 * Timeouts por fonte, com override por env para testes e ajuste operacional.
 * O satélite ganha 20 s porque um cold start do /lightning chega perto de
 * 25 s; estourou, a fonte responde "timeout" em vez de pendurar o consumidor.
 */
function timeoutDoEnv(nome: string, padrao: number): number {
  const valor = Number(process.env[nome]);
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
}

function erroDeEntrada(mensagem: string): Response {
  return Response.json(
    { error: mensagem },
    { status: 400, headers: { ...CORS, "cache-control": "no-store" } },
  );
}

const statusDe = (resultado: unknown): SourceStatus =>
  resultado === TIMEOUT
    ? "timeout"
    : resultado === null || resultado === undefined
      ? "unavailable"
      : "ok";

/**
 * Coordenada estrita: decimal simples, nada mais. `Number("")` é 0 — um
 * template de URL não preenchido (`?lat=&lon=...`) recebia clima do Golfo da
 * Guiné sem nenhum sinal de erro — e `Number` ainda aceita "0x10" e "1e3".
 */
const COORDENADA = /^-?\d+(\.\d+)?$/;

function coordenada(param: string): number {
  const texto = param.trim();
  return COORDENADA.test(texto) ? Number(texto) : NaN;
}

/**
 * Bloco de eventos a partir do payload cru. Um 200 sem count numérico e sem
 * lista de events é malformado e vira null — fonte degradada —, não um
 * `count: 0` com cara de céu calmo (o contrato proíbe fabricar o zero).
 */
function blocoDeEventos(
  cru: unknown,
  mapear: (events: unknown) => { lat: number | null; lon: number | null }[],
) {
  if (cru === null || cru === undefined || typeof cru !== "object") return null;
  const registro = cru as Record<string, unknown>;
  const count = numeroOuNull(registro.count);
  const events = Array.isArray(registro.events) ? mapear(registro.events) : null;
  if (count === null && events === null) return null;
  return { count: count ?? events!.length, events: events ?? [] };
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const latParam = searchParams.get("lat");
  const lonParam = searchParams.get("lon");

  // Validação espelhando o backend, antes de qualquer fonte: request inválida
  // não gasta uma invocação da AWS nem entra em cache.
  if (latParam === null || lonParam === null) {
    return erroDeEntrada(
      "Missing lat or lon query parameters. Example: /api/v1/now?lat=-23.55&lon=-46.63",
    );
  }
  const lat = coordenada(latParam);
  const lon = coordenada(lonParam);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return erroDeEntrada(
      "lat must be a number in [-90, 90] and lon a number in [-180, 180]",
    );
  }

  // Duas casas (~1 km) é a chave de cache real das fontes (HIG-09); ecoar a
  // coordenada já arredondada documenta a granularidade para quem consome.
  const latKey = Number(lat.toFixed(2));
  const lonKey = Number(lon.toFixed(2));
  const latStr = lat.toFixed(2);
  const lonStr = lon.toFixed(2);

  const satMs = timeoutDoEnv("API_V1_TIMEOUT_SATELLITE_MS", 20_000);
  const extMs = timeoutDoEnv("API_V1_TIMEOUT_WEATHER_MS", 10_000);
  // credential public: a chave do site nunca sai por esta rota. timeoutMs
  // aborta o fetch de verdade; o comTimeout por cima garante a resposta e
  // rotula a demora, inclusive se o abort não disparar.
  const publica = { credential: "public" as const, timeoutMs: satMs };

  const [clima, raios, fogo, chuva, lugar] = await Promise.all([
    comTimeout(getOpenMeteo({ lat: latKey, lon: lonKey }), extMs),
    comTimeout(getLightning(latStr, lonStr, RADIUS_KM, publica), satMs),
    comTimeout(getFireSpots(latStr, lonStr, RADIUS_KM, publica), satMs),
    comTimeout(getRain(latStr, lonStr, publica), satMs),
    comTimeout(reverseGeocode(latKey, lonKey), extMs),
  ]);

  // Os blocos vêm primeiro; o status de cada fonte é o do bloco que sobrou.
  // Assim um 200 malformado (bloco null) degrada a fonte em vez de passar por
  // dado — e TIMEOUT continua distinto de indisponível.
  const weather =
    clima !== TIMEOUT && clima !== null
      ? mapOpenMeteoCurrent(clima.current)
      : null;
  const rainSatellite = chuva !== TIMEOUT ? mapRain(chuva) : null;
  const lightning =
    raios !== TIMEOUT ? blocoDeEventos(raios, mapLightningEvents) : null;
  const fire = fogo !== TIMEOUT ? blocoDeEventos(fogo, mapFireEvents) : null;
  const geocode = lugar !== TIMEOUT ? lugar ?? null : null;

  const sources = {
    weather: clima === TIMEOUT ? ("timeout" as const) : statusDe(weather),
    rainSatellite:
      chuva === TIMEOUT ? ("timeout" as const) : statusDe(rainSatellite),
    lightning: raios === TIMEOUT ? ("timeout" as const) : statusDe(lightning),
    fire: fogo === TIMEOUT ? ("timeout" as const) : statusDe(fire),
    geocoding: lugar === TIMEOUT ? ("timeout" as const) : statusDe(geocode),
  };

  const corpo = {
    version: VERSION,
    location: {
      lat: latKey,
      lon: lonKey,
      radiusKm: RADIUS_KM,
      city: geocode?.name ?? null,
      state: geocode?.state ?? null,
      country: geocode?.country ?? null,
    },
    weather,
    rainSatellite,
    lightning,
    fire,
    sources,
    fetchedAt: new Date().toISOString(),
  };

  // Resposta parcial é dado: 200 enquanto alguma fonte de dados responder.
  // 503 só quando as quatro estão fora — o mesmo vocabulário do /api/health.
  const algumaFonteDeDados = [
    sources.weather,
    sources.rainSatellite,
    sources.lightning,
    sources.fire,
  ].some((s) => s === "ok");

  return Response.json(corpo, {
    status: algumaFonteDeDados ? 200 : 503,
    headers: { ...CORS, "cache-control": cacheControlFor(sources) },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}
