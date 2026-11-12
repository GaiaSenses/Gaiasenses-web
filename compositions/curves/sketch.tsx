"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { acompanharJanela } from "@/lib/p5-canvas-fit";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { usePd4Web } from "@/app/[locale]/map3/pd4web-context";
import { GAIA } from "@/lib/gaia-vocabulary";

export type CurvesSketchProps = {
  rain: number;
  temperature: number;
  /** Onde o globo está apontando. Repassado ao patch do mapa, que soniza. */
  lat: number;
  lon: number;
  play: boolean;
  pd4web?: pd4web.Pd4Web | null;
};

const FPS_MIN = 5;
const FPS_MAX = 30;

const CRITICAL_RAIN = 10;
const CRITICAL_TEMP = 35;

function sketch(p5: P5CanvasInstance<SketchProps & CurvesSketchProps>) {
  // inspired by: https://openprocessing.org/sketch/1176431
  let rain = 0;
  let temperature = 0;
  let lat = 0;
  let lon = 0;
  let play = false;

  let [width, height] = [p5.windowWidth, p5.windowHeight];
  let canvas: any | null = null;

  let pd4web: pd4web.Pd4Web | null = null;

  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(width, height, p5.P2D);
    const fps = p5.map(rain, 0, CRITICAL_RAIN, FPS_MIN, FPS_MAX);
    p5.frameRate(fps);
    // O canvas passa a acompanhar a caixa onde vive: sem isto ele
    // guarda para sempre o tamanho que a janela tinha no instante em
    // que a obra abriu. Ver lib/p5-canvas-fit.ts.
    acompanharJanela(p5, (largura, altura) => {
      width = largura;
      height = altura;
      p5.resizeCanvas(largura, altura);
    });
  };

  p5.updateWithProps = (props: any) => {
    rain = Number.isNaN(props.rain) ? rain : props.rain;
    temperature = Number.isNaN(props.temperature)
      ? temperature
      : props.temperature;
    lat = Number.isFinite(props.lat) ? props.lat : lat;
    lon = Number.isFinite(props.lon) ? props.lon : lon;
    play = props.play;

    const fps = p5.map(rain, 0, CRITICAL_RAIN, FPS_MIN, FPS_MAX);
    p5.frameRate(fps);

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
    pd4web = props.pd4web;
  };

  p5.draw = () => {
    const red = p5.map(temperature, 0, CRITICAL_TEMP, 50, 255);
    const blue = p5.map(temperature, 0, CRITICAL_TEMP, 255, 50);

    p5.noFill();
    p5.stroke(p5.random(10, red), 10, p5.random(10, blue));

    p5.bezier(
      p5.random(width),
      0,
      p5.random(width),
      p5.random(width),
      p5.random(width),
      p5.random(width),
      p5.random(width),
      height,
    );
    // This used to send Math.random() on the legacy aliases, which made the
    // map patch sing to numbers that had nothing to do with where the globe
    // was pointing — and, because the map itself had its sending switched off,
    // that noise was the ONLY lat/lon the patch ever saw. Now it is the real
    // position, on the canonical channels the rest of the app uses.
    pd4web?.sendFloat(GAIA.LAT, lat);
    pd4web?.sendFloat(GAIA.LON, lon);
  };
}


export default function CurvesSketch(initialProps: CurvesSketchProps) {
  const { pd4web } = usePd4Web();
  const searchParams = useSearchParams();

  // ler params e converter para número quando existirem
  const urlRain = searchParams?.get("rain");
  const urlTemperature = searchParams?.get("temperature");
  const urlLat = searchParams?.get("lat");
  const urlLon = searchParams?.get("lon");
  const urlPlay = searchParams?.get("play");

  const rain = useMemo(
    () => (urlRain !== null ? Number(urlRain) : initialProps.rain),
    [urlRain, initialProps.rain],
  );

  const temperature = useMemo(
    () =>
      urlTemperature !== null
        ? Number(urlTemperature)
        : initialProps.temperature,
    [urlTemperature, initialProps.temperature],
  );

  const lat = useMemo(
    () => (urlLat !== null ? Number(urlLat) : initialProps.lat),
    [urlLat, initialProps.lat],
  );

  const lon = useMemo(
    () => (urlLon !== null ? Number(urlLon) : initialProps.lon),
    [urlLon, initialProps.lon],
  );

  const play =
    urlPlay !== null
      ? urlPlay === "true" || urlPlay === "1"
      : initialProps.play;

  // passa os valores numéricos ao wrapper p5 — NextReactP5Wrapper chamará updateWithProps internamente
  return (
    <NextReactP5Wrapper
      sketch={sketch}
      rain={rain}
      temperature={temperature}
      lat={lat}
      lon={lon}
      play={play}
      pd4web={pd4web}
    />
  );
}
