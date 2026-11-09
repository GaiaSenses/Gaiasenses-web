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

/**
 * The cadence floor, raised from 1 to 12.
 *
 * At one frame per second a drizzle painted one small mark per second, and a
 * visitor standing in front of the work for half a minute saw a handful of
 * pixels appear — indistinguishable from a broken sketch. Rain still decides
 * the cadence all the way to 60 fps; what changed is how often the piece
 * breathes when the rain is barely there.
 */
const FPS_MIN = 12;
const FPS_MAX = 60;

const CRITICAL_RAIN = 10;

/**
 * How much of a stroke the eraser takes back.
 *
 * The work paints a blue mark and then a black one, and the black one used to
 * be a fixed `random(100) x random(40)` while the blue one followed the rain:
 * in light rain it wiped out roughly fifty times the area it had just drawn,
 * so twelve seconds of drizzle left 0.1% of the screen painted and the work
 * looked broken. Cutting the eraser from the same measure as the stroke makes
 * the balance positive by construction — 0.6 of each side is 0.36 of the
 * area, every frame, at any rain value — while keeping the erasing gesture
 * that gives the piece its flicker.
 *
 * It is also self-limiting, which is why there is no need to clear the canvas:
 * a stroke only paints pixels that are still black, while an eraser always
 * takes painted ones, so coverage settles around 1 / (1 + 0.36) = 73% instead
 * of filling the screen. Rain decides how fast it gets there, and how coarse
 * the grain is on the way.
 */
const ERASER_SCALE = 0.6;

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

    applyRain();
    p5.background(0);
  };

  /**
   * Turn the current rain reading into geometry and cadence.
   *
   * This used to live inline in `setup`, which ran before any prop arrived —
   * so `rain` was still 0 and the rectangles stayed frozen at their minimum
   * size however hard it rained. `updateWithProps` recomputed the frame rate
   * and nothing else, so rain reached the *speed* of the piece but never its
   * shape. Both now come from the same function, called from both places.
   *
   * The maps clamp (`true`): a downpour past CRITICAL_RAIN would otherwise ask
   * for hundreds of frames per second and rectangles taller than the canvas.
   */
  function applyRain() {
    rectWidth = p5.map(
      rain,
      0,
      CRITICAL_RAIN,
      RECT_MIN_WIDTH,
      RECT_MAX_WIDTH,
      true
    );
    rectHeight = p5.map(
      rain,
      0,
      CRITICAL_RAIN,
      RECT_MIN_HEIGHT,
      RECT_MAX_HEIGHT,
      true
    );
    p5.frameRate(p5.map(rain, 0, CRITICAL_RAIN, FPS_MIN, FPS_MAX, true));
  }

  p5.updateWithProps = (props: any) => {
    rain = Number.isNaN(props.rain) ? rain : props.rain;
    play = props.play;

    applyRain();

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    p5.noStroke();

    // One stroke of rain...
    const strokeWidth = p5.random(rectWidth);
    const strokeHeight = p5.random(rectHeight);
    p5.fill(0, 0, p5.random(30, 255));
    p5.rect(p5.random(width), p5.random(height), strokeWidth, strokeHeight);

    // ...and an eraser cut from that same stroke, somewhere else on the
    // canvas. Smaller than what was just painted, always: see ERASER_SCALE.
    p5.fill(0, 0, 0);
    p5.rect(
      p5.random(width),
      p5.random(height),
      strokeWidth * ERASER_SCALE,
      strokeHeight * ERASER_SCALE
    );
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
