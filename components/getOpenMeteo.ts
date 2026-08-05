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

export default async function getOpenMeteo({ lat, lon }: GetOpenMeteoParams) {
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

    // Attributes for timezone and location
    const utcOffsetSeconds = response.utcOffsetSeconds();
    const timezone = response.timezone();
    const timezoneAbbreviation = response.timezoneAbbreviation();
    const latitude = response.latitude();
    const longitude = response.longitude();

    const current = response.current()!;

    // Note: The order of weather variables in the URL query and the indices below need to match!
    const weatherData = {
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
    console.log(weatherData.current);
    const transformedData = {
      city: "Open Weather API",
      clouds: parseFloat(weatherData.current.cloudCover.toFixed(1)),
      lat: latitude,
      lon: longitude,
      main: {
        feels_like: parseFloat(
          weatherData.current.apparentTemperature.toFixed(1)
        ),
        humidity: weatherData.current.relativeHumidity2m,
        pressure: weatherData.current.surfacePressure,
        temp: parseFloat(weatherData.current.temperature2m.toFixed(1)),
        grnd_level: 0,
      },
      rain: {
        "1h":
          weatherData.current.showers ||
          weatherData.current.rain ||
          weatherData.current.precipitation,
      },
      state: "Open weather API",

      visibility: parseFloat(weatherData.current.cloudCover.toFixed(1)),
      weather: [{ description: "", icon: "", main: "" }],
      wind: {
        deg: parseFloat(weatherData.current.windDirection10m.toFixed(1)),
        gust: parseFloat(weatherData.current.windGusts10m.toFixed(1)),
        speed: parseFloat(weatherData.current.windSpeed10m.toFixed(1)),
      },
    };
    return transformedData;
  } catch (error) {
    console.log("Error fetching Open Meteo data:", error);
    const transformedData = {
      city: "Open Weather API",
      clouds: 30,
      lat: 0,
      lon: 0,
      main: {
        feels_like: 24,
        humidity: 30,
        pressure: 20,
        temp: 24,
        grnd_level: 0,
      },
      rain: {},
      state: "Open weather API",

      visibility: 100,
      weather: [
        {
          description: "indisponível",
          icon: "indisponível",
          main: "indisponível",
        },
      ],
      wind: {
        deg: 90,
        gust: 40,
        speed: 30,
      },
    };
    return transformedData;
  }
}
