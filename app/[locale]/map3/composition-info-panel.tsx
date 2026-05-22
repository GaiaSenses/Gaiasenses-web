"use client";

import { createPortal } from "react-dom";

type PlaybackWeatherSummary = {
  description: string;
  temperature: number;
  humidity: number;
  clouds: number;
  windSpeed: number;
  windDeg: number;
  windGust: number;
  rain1h: number;
};

type CompositionInfoPanelProps = {
  compositionName: string;
  compositionAuthor?: string;
  compositionAttributes?: string[];
  weather: PlaybackWeatherSummary;
  weatherLabels: {
    temperature: string;
    humidity: string;
    clouds: string;
    wind: string;
    direction: string;
    gust: string;
    rain: string;
    co2: string;
    lightnings: string;
    firesSingular: string;
    firesPlural: string;
  };
  lightningCount?: number;
  fireSpotsCount?: number;
  co2Ppm: number | null;
  locationInfo: { name: string; state: string; country: string };
  lat: number;
  lng: number;
};

function formatNumber(value: number, digits = 0) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return value.toFixed(digits);
}

function formatLocation(
  locationInfo: { name: string; state: string; country: string },
  lat: number,
  lng: number,
) {
  const parts = [locationInfo.name, locationInfo.state, locationInfo.country]
    .map((part) => part?.trim())
    .filter(Boolean);

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return `${formatNumber(lat, 2)}, ${formatNumber(lng, 2)}`;
}

export default function CompositionInfoPanel({
  compositionName,
  compositionAuthor,
  compositionAttributes = [],
  weather,
  weatherLabels,
  lightningCount = 0,
  fireSpotsCount = 0,
  co2Ppm,
  locationInfo,
  lat,
  lng,
}: CompositionInfoPanelProps) {
  const locationLabel = formatLocation(locationInfo, lat, lng);
  const normalizedAttributes = new Set(
    compositionAttributes
      .map((attribute) => attribute.trim().toLowerCase())
      .filter(Boolean),
  );

  const hasAnyAttribute = (...keys: string[]) =>
    keys.some((key) => normalizedAttributes.has(key));

  const metricClass = (highlight: boolean) =>
    highlight ? "font-medium" : "font-light";
  const fireLabel =
    Math.round(fireSpotsCount) > 1
      ? weatherLabels.firesPlural
      : weatherLabels.firesSingular;

  return createPortal(
    <aside className="pointer-events-none absolute right-2 bottom-2 z-20 w-full max-w-[calc(100vw-0.75rem)] select-none md:w-[330px] mix-blend-exclusion">
      <div className="space-y-1 text-right">
        <p className="text-[15px] leading-[1.1] font-semibold capitalize text-gray-300 mix-blend-difference">
          {compositionName}
        </p>
        <div className="space-y-1 text-[11px] leading-tight font-medium text-gray-300 mix-blend-difference">
          <p>{compositionAuthor ?? "Unknown"}</p>
          <p className="truncate">{locationLabel}</p>
        </div>
      </div>

      <div className="justify-end text-end mt-4 grid grid-cols-3 gap-x-3 gap-y-1 font-light text-[11px] leading-snug text-gray-300">
        {weather.description && (
          <p className="col-span-3 truncate capitalize">
            {weather.description}
          </p>
        )}

        <p className={metricClass(hasAnyAttribute("temperature", "temp"))}>
          {weatherLabels.temperature} {formatNumber(weather.temperature)} C
        </p>
        <p className={metricClass(hasAnyAttribute("humidity"))}>
          {weatherLabels.humidity} {formatNumber(weather.humidity)}%
        </p>
        <p className={metricClass(hasAnyAttribute("clouds", "cloud"))}>
          {weatherLabels.clouds} {formatNumber(weather.clouds)}%
        </p>
        <p className={metricClass(hasAnyAttribute("windspeed", "wind"))}>
          {weatherLabels.wind} {formatNumber(weather.windSpeed, 1)} m/s
        </p>
        <p
          className={metricClass(
            hasAnyAttribute("winddeg", "winddirection", "wind"),
          )}
        >
          {weatherLabels.direction} {formatNumber(weather.windDeg)} deg
        </p>
        <p
          className={metricClass(
            hasAnyAttribute("windspeed", "windgust", "wind"),
          )}
        >
          {weatherLabels.gust} {formatNumber(weather.windGust, 1)} m/s
        </p>
        {weather.rain1h !== undefined && (
          <p
            className={metricClass(
              hasAnyAttribute("rain", "rainfall", "precipitation"),
            )}
          >
            {weatherLabels.rain} {formatNumber(weather.rain1h, 1)} mm/h
          </p>
        )}
        {lightningCount > 0 && (
          <p
            className={metricClass(
              hasAnyAttribute("lightningcount", "lightnings", "lightning"),
            )}
          >
            {weatherLabels.lightnings} {Math.round(lightningCount)}
          </p>
        )}
        {fireSpotsCount > 0 && (
          <p
            className={metricClass(
              hasAnyAttribute("firecount", "firespots", "fires", "fire"),
            )}
          >
            {Math.round(fireSpotsCount)} {fireLabel}
          </p>
        )}
        <p className={metricClass(hasAnyAttribute("co2"))}>
          {weatherLabels.co2}{" "}
          {co2Ppm == null ? "--" : `${Math.round(co2Ppm)} ppm`}
        </p>
      </div>
    </aside>,
    document.body,
  );
}
