import { fetchWeatherApi } from "openmeteo";

const params = {
  latitude: -23.5475,
  longitude: -46.6361,
  current: [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "precipitation",
    "rain",
    "showers",
    "snowfall",
    "weather_code",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "surface_pressure",
    "pressure_msl",
    "is_day",
  ],
  timezone: "auto",
  forecast_days: 1,
};
const url = "https://api.open-meteo.com/v1/forecast";

type GetOpenMeteoParams = {
  lat: string | number;
  lon: string | number;
};

/** The current-conditions block, one field per variable in `params.current`. */
export type OpenMeteoCurrent = {
  time: Date;
  temperature2m: number;
  relativeHumidity2m: number;
  apparentTemperature: number;
  precipitation: number;
  rain: number;
  showers: number;
  snowfall: number;
  weatherCode: number;
  cloudCover: number;
  windSpeed10m: number;
  windDirection10m: number;
  windGusts10m: number;
  surfacePressure: number;
  pressureMsl: number;
  isDay: number;
};

export type OpenMeteoResult = {
  /** Coordinates as Open-Meteo resolved them, not as the caller sent them. */
  lat: number;
  lon: number;
  current: OpenMeteoCurrent;
};

/**
 * Current weather from Open-Meteo, or `null` when it could not be reached.
 *
 * The catch used to answer with a whole invented forecast — 24 °C, 30 m/s of
 * wind — with description "indisponível" as the only hint. An outage became a
 * mild afternoon in São Paulo, including for the research record. `null` is
 * the vocabulary BUG-02 established for the satellite sources, and the weather
 * earns no exception: the callers decide what an unknown means for them.
 */
export default async function getOpenMeteo({
  lat,
  lon,
}: GetOpenMeteoParams): Promise<OpenMeteoResult | null> {
  try {
    // A lib aceita fetchOptions como 6º argumento e repassa ao fetch do Next.
    // Sem isso a chamada ficava sujeita ao default do App Router e era refeita a
    // cada render da página principal — a única fonte de dados do projeto sem
    // nenhum controle de frequência.
    //
    // 15 min: o Open-Meteo publica em intervalos dessa ordem, então cachear mais
    // que isso não perde nada, e a coordenada arredondada faz visitantes na
    // mesma região compartilharem a resposta.
    const responses = await fetchWeatherApi(
      url,
      {
        ...params,
        latitude: Number(Number(lat).toFixed(2)),
        longitude: Number(Number(lon).toFixed(2)),
      },
      3,
      0.2,
      2,
      { next: { revalidate: 900 } },
    );
    const response = responses[0];

    const utcOffsetSeconds = response.utcOffsetSeconds();
    const current = response.current()!;

    // The order of weather variables in `params.current` and the indices below
    // need to match!
    return {
      lat: response.latitude(),
      lon: response.longitude(),
      current: {
        time: new Date((Number(current.time()) + utcOffsetSeconds) * 1000),
        temperature2m: current.variables(0)!.value(),
        relativeHumidity2m: current.variables(1)!.value(),
        apparentTemperature: current.variables(2)!.value(),
        precipitation: current.variables(3)!.value(),
        rain: current.variables(4)!.value(),
        showers: current.variables(5)!.value(),
        snowfall: current.variables(6)!.value(),
        weatherCode: current.variables(7)!.value(),
        cloudCover: current.variables(8)!.value(),
        windSpeed10m: current.variables(9)!.value(),
        windDirection10m: current.variables(10)!.value(),
        windGusts10m: current.variables(11)!.value(),
        surfacePressure: current.variables(12)!.value(),
        pressureMsl: current.variables(13)!.value(),
        isDay: current.variables(14)!.value(),
      },
    };
  } catch (error) {
    console.error("[weather] Open-Meteo indisponível —", error);
    return null;
  }
}
