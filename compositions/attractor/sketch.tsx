"use client";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";

export type AttractorSketchProps = {
  lightningCount: number;
  play: boolean;
};

function sketch(p5: P5CanvasInstance<SketchProps & AttractorSketchProps>) {
  let lightningCount: number = 0;
  let play: boolean = false;

  let num: number = 5000;
  let x: number[] = new Array(num);
  let y: number[] = new Array(num);

  let vx: number[] = new Array(num);
  let vy: number[] = new Array(num);

  let ax: number[] = new Array(num);
  let ay: number[] = new Array(num);

  let gravity: number[] = new Array(2);

  let magnetism: number = 10.0;
  let radius: number = 1.5;
  let slowFactor: number = 0.95;

  let [width, height]: number[] = [p5.windowWidth, p5.windowHeight];

  const initialize = () => {
    num = p5.floor(p5.map(lightningCount, 0, 25, 10, 5000));
    if (lightningCount >= 25) {
      magnetism = 15.0;
      slowFactor = 0.99;
    } else if (lightningCount > 0) {
      magnetism = 10.0;
      slowFactor = 0.95;
    } else {
      magnetism = 5.0;
      slowFactor = 0.92;
    }

    // console.log(`num: ${num}`);
  };

  p5.setup = () => {
    p5.createCanvas(width, height);
    let backgroundColor = p5.color(4, 22, 42);
    // let backgroundColor = p5.color(4, 22, 42, 0); // descomentar essa linha para ficar com o fundo transparente
    p5.background(backgroundColor);
    p5.noStroke();
    p5.ellipseMode(p5.RADIUS);
    p5.blendMode(p5.ADD);

    for (let i = 0; i < num; i++) {
      x[i] = p5.random(width);
      y[i] = p5.random(height);
      vx[i] = 0;
      vy[i] = 0;
      ax[i] = 0;
      ay[i] = 0;
    }

    initialize();
  };

  p5.draw = () => {
    p5.fill(4, 22, 42, 0);
    p5.rect(0, 0, width, height);

    gravity[0] = p5.random(0, width);
    gravity[1] = p5.random(0, height);

    for (let i = 0; i < num; i++) {
      let distance: number = p5.dist(gravity[0], gravity[1], x[i], y[i]);
      if (distance > 1 && distance < p5.min(width, height)) {
        ax[i] = (magnetism * (gravity[0] - x[i])) / (distance * distance);
        ay[i] = (magnetism * (gravity[1] - y[i])) / (distance * distance);
      }

      let randomFactorX: number = p5.random(-3, 3);
      let randomFactorY: number = p5.random(-3, 3);

      ax[i] = ax[i] * randomFactorX;
      ay[i] = ay[i] * randomFactorY;

      vx[i] += ax[i];
      vy[i] += ay[i];

      vx[i] = vx[i] * slowFactor;
      vy[i] = vy[i] * slowFactor;

      x[i] += vx[i];
      y[i] += vy[i];

      let velocities = p5.dist(0, 0, vx[i], vy[i]);
      let r = p5.map(velocities, 0, 5, 0, 255);
      let g = p5.map(velocities, 0, 5, 64, 255);
      let b = p5.map(velocities, 0, 5, 128, 255);
      // cor branco para ficara igual as estrelas
      // r = 255;
      // g = 255;
      // b = 255;
      p5.fill(r, g, b, 32); // mudar a opacidade de acordo com a quantidade de raios (ideia)
      p5.ellipse(x[i], y[i], radius, radius);
    }
  };

  p5.updateWithProps = (props: any) => {
    const count = Number.isNaN(props.lightningCount)
      ? lightningCount
      : props.lightningCount;
    play = props.play;

    if (lightningCount !== count) {
      lightningCount = count;
      initialize();
    }

    // console.log(`lightningCount: ${lightningCount}`);

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };
}

export default function NameSketch(initialProps: AttractorSketchProps) {
  const searchParams = useSearchParams();

  // ler parametros e converter para número quando existirem
  const urlLightningCount = searchParams?.get("lightningCount");
  const urlPlay = searchParams?.get("play");

  const lightningCount = useMemo(
    () =>
      urlLightningCount !== null
        ? Number(urlLightningCount)
        : initialProps.lightningCount,
    [urlLightningCount, initialProps.lightningCount]
  );

  const play =
    urlPlay !== null
      ? urlPlay === "true" || urlPlay === "1"
      : initialProps.play;

  // passa os valores numéricos ao wrapper p5 NextReactP5Wrapper chamará updateWithProps internamente
  return (
    <NextReactP5Wrapper
      sketch={sketch}
      lightningCount={lightningCount}
      play={play}
    />
  );
}
