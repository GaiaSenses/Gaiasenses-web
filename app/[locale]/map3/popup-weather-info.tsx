import { getWeather } from "@/components/getData";
import {
  CloudOff,
  CloudRain,
  Cloudy,
  Compass,
  Droplet,
  Thermometer,
  Tornado,
  Wind,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function PopupWeatherInfo({
  lat,
  lon,
  lang = "pt",
}: Readonly<{
  lat: string | number;
  lon: string | number;
  lang: string;
}>) {
  const weatherData = await getWeather(lat, lon, { lang: lang });

  // Três estados, como no popup dos raios: null é a fonte que não respondeu,
  // e dizer isso é diferente de exibir um clima que ninguém mediu.
  if (weatherData === null) {
    const t = await getTranslations("Index");
    return (
      <div className="mt-2">
        <div className="flex items-end gap-1 italic opacity-70">
          <CloudOff size={20} />
          <p>{t("compositionInfo.labels.unavailable")}</p>
        </div>
      </div>
    );
  }

  const rain = weatherData.rain as { "1h"?: number };
  const rainAmount = rain["1h"] ?? 0;
  const hasRain = rainAmount > 0;

  return (
    <div className="mt-2 ">
      <p className="text-lg text-pretty capitalize">
        {weatherData.weather[0].description ?? "indisponível"}
      </p>
      <div className="grid grid-cols-3 grid-rows-2 gap-4 mt-2">
        <div className="flex items-end gap-1">
          <Thermometer size={20}></Thermometer>
          <p>{weatherData.main.temp ?? "indisponível"}°C</p>
        </div>

        <div className="flex items-end gap-1">
          <Droplet size={20}></Droplet>
          <p className="">
            {weatherData.main.humidity.toFixed(0) ?? "indisponível"}%
          </p>
        </div>

        <div className="flex items-end gap-1">
          <Cloudy size={20}></Cloudy>
          <p>{weatherData.clouds.toFixed(0) ?? "indisponível"}%</p>
        </div>

        <div className="flex items-end gap-1">
          <Wind size={20}></Wind>
          <p>{weatherData.wind.speed ?? "indisponível"}m/s</p>
        </div>
        <div className="flex items-end gap-1">
          <Compass size={20}></Compass>
          <p>{weatherData.wind.deg}°</p>
        </div>
        <div className="flex items-end gap-1">
          <Tornado size={20}></Tornado>
          <p>{weatherData.wind.gust ?? "indisponível"}m/s</p>
        </div>
      </div>
      {hasRain && (
        <div className="flex items-end gap-1 mt-2">
          <CloudRain size={20} />
          <p>{rainAmount.toFixed(1)} mm/h</p>
        </div>
      )}
    </div>
  );
}
