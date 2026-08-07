"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type DigitalOrganismSketchProps = {
  rain: number;
  play: boolean;
};

function sketch(
  p5: P5CanvasInstance<SketchProps & DigitalOrganismSketchProps>
) {
  // inspired by: https://openprocessing.org/sketch/1864228
  const DEAD = 0;
  const ALIVE = 1;
  const n = 500;
  let cells: Uint8Array;
  let zoom: number = 1;
  let g: any;
  let brushSize: number = 10;

  let play = false;

  let [width, height] = [p5.windowWidth, p5.windowHeight];
  let canvas: any | null = null;

  const condition = {
    0: (status: number, hood0: number, hood1: number) => {
      return status ? hood0 != hood1 : hood0 * 2.6 > hood1;
    },
  };

  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(width, height, p5.P2D);

    const m = p5.min(width, height);
    zoom = n / m;

    cells = new Uint8Array(n * n).fill(DEAD);
    g = p5.createGraphics(n, n);
    g.background(0).pixelDensity(1).loadPixels();
  };

  p5.updateWithProps = (props: any) => {
    brushSize = (props.rain + 3) * 3;
    play = props.play;

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    p5.frameRate(60);
    p5.background("gray");

    const mx = p5.int(
      p5.constrain(Math.floor(Math.random() * width) * zoom, 0, n - 1)
    );
    const my = p5.int(
      p5.constrain(Math.floor(Math.random() * height) * zoom, 0, n - 1)
    );
    if (p5.frameCount % 2 == 0) {
      if (brushSize > 40) {
        brushSize = 40;
      }
      let b = p5.int(brushSize);
      for (let dy = -b; dy <= b; dy++) {
        for (let dx = -b; dx <= b; dx++) {
          let d = p5.sqrt(dx ** 2 + dy ** 2);
          if (d > b) continue;
          let x = mx + dx;
          let y = my + dy;
          if (x < 0 || x >= n || y < 0 || y >= n) continue;
          cells[x + y * n] = p5.random(5000) < 1 && b - d < 1 ? ALIVE : DEAD;
        }
      }
    }
    const getNextState = condition[0];
    let next = new Uint8Array(cells);
    for (let y = 4; y < n - 4; y++) {
      for (let x = 4; x < n - 4; x++) {
        const i = x + y * n;

        const hood0 =
          cells[i + 1] +
          cells[i - 1] +
          cells[i - n] +
          cells[i + n] +
          cells[i - 1 - n] +
          cells[i - 1 + n] +
          cells[i + 1 - n] +
          cells[i + 1 + n] +
          cells[i + 2] +
          cells[i + 2 + n] +
          cells[i + 2 - n] +
          cells[i - 2] +
          cells[i - 2 + n] +
          cells[i - 2 - n] +
          cells[i + 2 * n] +
          cells[i + 2 * n - 1] +
          cells[i + 2 * n + 1] +
          cells[i - 2 * n] +
          cells[i - 2 * n + 1] +
          cells[i - 2 * n - 1];

        const hood1 =
          cells[i + 1] +
          cells[i + 2] +
          cells[i + 3] +
          cells[i + 4] +
          cells[i - 1] +
          cells[i - 2] +
          cells[i - 3] +
          cells[i - 4] +
          cells[i - n] +
          cells[i - 2 * n] +
          cells[i - 3 * n] +
          cells[i - 4 * n] +
          cells[i + n] +
          cells[i + 2 * n] +
          cells[i + 3 * n] +
          cells[i + 4 * n] +
          cells[i - n + 1] +
          cells[i - n + 2] +
          cells[i - n + 3] +
          cells[i - n + 4] +
          cells[i - 2 * n + 1] +
          cells[i - 2 * n + 2] +
          cells[i - 2 * n + 3] +
          cells[i - 3 * n + 1] +
          cells[i - 3 * n + 2] +
          cells[i - 4 * n + 1] +
          cells[i + n + 1] +
          cells[i + n + 2] +
          cells[i + n + 3] +
          cells[i + n + 4] +
          cells[i + 2 * n + 1] +
          cells[i + 2 * n + 2] +
          cells[i + 2 * n + 3] +
          cells[i + 3 * n + 1] +
          cells[i + 3 * n + 2] +
          cells[i + 4 * n + 1] +
          cells[i - n - 1] +
          cells[i - n - 2] +
          cells[i - n - 3] +
          cells[i - n - 4] +
          cells[i - 2 * n - 1] +
          cells[i - 2 * n - 2] +
          cells[i - 2 * n - 3] +
          cells[i - 3 * n - 1] +
          cells[i - 3 * n - 2] +
          cells[i - 4 * n - 1] +
          cells[i + n - 1] +
          cells[i + n - 2] +
          cells[i + n - 3] +
          cells[i + n - 4] +
          cells[i + 2 * n - 1] +
          cells[i + 2 * n - 2] +
          cells[i + 2 * n - 3] +
          cells[i + 3 * n - 1] +
          cells[i + 3 * n - 2] +
          cells[i + 4 * n - 1];

        let state = getNextState(cells[i], hood0, hood1);
        next[i] = p5.int(state);
        g.pixels[i * 4 + 3] = state ? 255 : 0;
      }
    }
    cells = next;
    g.updatePixels();
    p5.image(g, 0, 0, width, height);
  };
}

export default function DigitalOrganismSketch(
  initialProps: DigitalOrganismSketchProps
) {
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
