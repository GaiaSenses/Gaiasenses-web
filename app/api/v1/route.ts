/**
 * GET /api/v1 — a autodescrição da API pública: barata, cacheável por um dia,
 * e suficiente para alguém com curl descobrir o contrato sem abrir o repo.
 * O documento completo vive em docs/api-publica.md.
 */
import { CORS } from "./now/mappers";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      version: "1.0",
      service: "GaiaSenses public API",
      docs: "https://github.com/GaiaSenses/Gaiasenses-web/blob/main/docs/api-publica.md",
      endpoints: {
        "/api/v1/now": {
          method: "GET",
          query: {
            lat: "number in [-90, 90], required",
            lon: "number in [-180, 180], required",
          },
          radiusKm: 100,
          sources: {
            weather: "Open-Meteo (current conditions, WMO weather code)",
            lightning: "GOES-19 GLM via satellite-fetcher-aws",
            fire: "NASA FIRMS via satellite-fetcher-aws",
            rainSatellite: "GOES-19 RRQPEF rain rate (mm/h)",
            geocoding: "OpenWeather reverse geocoding",
          },
          semantics:
            "An unavailable source becomes a null block plus " +
            'sources.<name> = "unavailable" | "timeout". A count of 0 with ' +
            'sources.<name> = "ok" is a calm sky — distinct from null, which ' +
            "means the source did not answer. Values are never fabricated.",
          coordinates:
            "Echoed rounded to 2 decimals (~1 km): that is the real cache " +
            "granularity. Nearby requests share answers.",
        },
      },
      limits: {
        requestsPerMinutePerIp: 30,
        note: "Exceeding it answers 429 at the edge, before this API.",
      },
    },
    { headers: { ...CORS, "cache-control": "public, s-maxage=86400" } },
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}
