"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type RectanglesSketchProps = {
  rain: number;
  play: boolean;
};

const RECT_MAX_WIDTH = 15;
const RECT_MIN_WIDTH = 5;

const RECT_MAX_HEIGHT = 200;
const RECT_MIN_HEIGHT = 15;

const FPS_MIN = 1;
const FPS_MAX = 60;

const CRITICAL_RAIN = 10;

function sketch(p5: P5CanvasInstance<SketchProps & RectanglesSketchProps>) {
  // inspired by: https://openprocessing.org/sketch/1274144
  let rain = 0;
  let rectWidth = 0;
  let rectHeight = 0;
  let play = false;

  let [width, height] = [p5.windowWidth, p5.windowHeight];
  let canvas: any | null = null;

  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(width, height, p5.P2D);

    rectWidth = p5.map(rain, 0, CRITICAL_RAIN, RECT_MIN_WIDTH, RECT_MAX_WIDTH);
    rectHeight = p5.map(
      rain,
      0,
      CRITICAL_RAIN,
      RECT_MIN_HEIGHT,
      RECT_MAX_HEIGHT
    );
    const fps = p5.map(rain, 0, CRITICAL_RAIN, FPS_MIN, FPS_MAX);

    p5.frameRate(fps);
    p5.background(0);
  };

  p5.updateWithProps = (props: any) => {
    rain = Number.isNaN(props.rain) ? rain : props.rain;
    play = props.play;

    const fps = p5.map(rain, 0, CRITICAL_RAIN, FPS_MIN, FPS_MAX);
    p5.frameRate(fps);

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    p5.noStroke();
    p5.fill(0, 0, p5.random(30, 255));
    p5.rect(
      p5.random(width),
      p5.random(height),
      p5.random(rectWidth),
      p5.random(rectHeight)
    );

    p5.fill(0, 0, 0);
    p5.rect(p5.random(width), p5.random(height), p5.random(100), p5.random(40));
  };
}

export default function RectanglesSketch(initialProps: RectanglesSketchProps) {
  const searchParams = useSearchParams();

  // ler params e converter para número quando existirem
  const urlRain = searchParams?.get("rain");
  const urlPlay = searchParams?.get("play");

  const rain = useMemo(
    () => (urlRain !== null ? Number(urlRain) : initialProps.rain),
    [urlRain, initialProps.rain]
  );

  const play =
    urlPlay !== null
      ? urlPlay === "true" || urlPlay === "1"
      : initialProps.play;

  // passa os valores numéricos ao wrapper p5 — NextReactP5Wrapper chamará updateWithProps internamente
  return <NextReactP5Wrapper sketch={sketch} rain={rain} play={play} />;
}
