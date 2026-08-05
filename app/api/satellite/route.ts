import { NextResponse } from "next/server";
import { getWeather, getLightning, getFireSpots } from "@/components/getData";

const requestLog: Record<string, number[]> = {};
const LIMIT = 20;
const INTERVAL = 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - INTERVAL;

  if (!requestLog[ip]) {
    requestLog[ip] = [];
  }

  requestLog[ip] = requestLog[ip].filter((ts) => ts > windowStart);

  if (requestLog[ip].length >= LIMIT) {
    return true; 
  }

  requestLog[ip].push(now);
  return false;
}

//função GET
export async function GET(req: Request){
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    if (isRateLimited(ip)) {
        return NextResponse.json(
             {error: "Too many requests, please slow down." },
            { status: 429 }
        );
    }

    const { searchParams } = new URL(req.url);
    const lat = searchParams.get("lat");
    const lon = searchParams.get("lon");
    //http://localhost:3000/api/satellite?lat=-17&lon=50
    
    if(!lat || !lon) {
        return NextResponse.json({error: "Missing lat or lon query parameters. Example: '...satellite?lat=-17&lon=50' "},
        { status: 400 }
        );
    }

    try{
        const [weather, lightning, fireSpots] = await Promise.all([
            getWeather(lat, lon),
            getLightning(lat, lon, 100),
            getFireSpots(lat, lon, 100),
        ]);

        const data = {
            temperature: weather.main?.temp ?? null,
            windSpeed: weather.wind?.speed ?? null,
            windDeg: weather.wind?.deg ?? null,
            humidity: weather.main?.humidity ?? null,
            // null, não 0: esta rota devolve JSON para quem quiser consumir, e um
            // consumidor precisa distinguir "nenhum raio" de "não consegui saber".
            lightningCount: lightning?.count ?? null,
            fireSpotsCount: fireSpots?.count ?? null,
            rain: (weather.rain as { "1h": number } | undefined)?.["1h"] ?? 0,
            pressure: weather.main?.pressure ?? null,
            pressure_grnd_level: weather.main?.grnd_level ?? null,
            visibility: weather?.visibility ?? null,
            cloud: weather.clouds ?? null,
            lat: weather.lat ?? null,
            lon: weather.lon ?? null
            //description: weather.weather?.[0]?.description ?? null, //por enquanto não funciona
        };
        return NextResponse.json(data);

    }catch (error){
        console.error("API error: ", error);
        return NextResponse.json(
            { error: "Failed to fetch satellite data." },
            { status: 500 }
        );
    }
}