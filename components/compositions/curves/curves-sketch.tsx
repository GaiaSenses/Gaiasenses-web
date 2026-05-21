"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { usePd4Web } from "@/app/[locale]/map3/pd4web-context";

export type CurvesSketchProps = {
  rain: number;
  temperature: number;
  play: boolean;
  pd4web?: pd4web.Pd4Web | null;
};

const FPS_MIN = 5;
const FPS_MAX = 30;

const CRITICAL_RAIN = 10;
const CRITICAL_TEMP = 35;

function randomLatitude() {
  return Math.random() * 180 - 90;
}

function randomLongitude() {
  return Math.random() * 360 - 180;
}

function sketch(p5: P5CanvasInstance<SketchProps & CurvesSketchProps>) {
  // inspired by: https://openprocessing.org/sketch/1176431
  let rain = 0;
  let temperature = 0;
  let play = false;

  let [width, height] = [p5.windowWidth, p5.windowHeight];
  let canvas: any | null = null;

  let pd4web: pd4web.Pd4Web | null = null;

  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(width, height, p5.P2D);
    const fps = p5.map(rain, 0, CRITICAL_RAIN, FPS_MIN, FPS_MAX);
    p5.frameRate(fps);
  };

  p5.updateWithProps = (props: any) => {
    rain = Number.isNaN(props.rain) ? rain : props.rain;
    temperature = Number.isNaN(props.temperature)
      ? temperature
      : props.temperature;
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
    const lat = randomLatitude();
    const lon = randomLongitude();

    pd4web?.sendFloat(latitudeReceiver, lat);
    pd4web?.sendFloat(longitudeReceiver, lon);
  };
}

const latitudeReceiver = "lati";
const longitudeReceiver = "rotacaoSite";
const pollFrequencyMs = 1000;

export default function CurvesSketch(initialProps: CurvesSketchProps) {
  const { pd4web } = usePd4Web();
  const searchParams = useSearchParams();

  // ler params e converter para número quando existirem
  const urlRain = searchParams?.get("rain");
  const urlTemperature = searchParams?.get("temperature");
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
      play={play}
      pd4web={pd4web}
    />
  );
}
