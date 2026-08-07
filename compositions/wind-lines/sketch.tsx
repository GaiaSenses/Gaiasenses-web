"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";

import { Vector } from "p5";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type WindLinesRESketchProps = {
  windSpeed: number;
  play: boolean;
};
//versão mais bonita, sem efeito pontilhado, só que mais pesada/lenta em hardwares mais fracos.
/*
function sketch(p5: P5CanvasInstance<SketchProps & WindLinesRESketchProps>) {
  //inspired by https://openprocessing.org/sketch/894918
  let n = 3100;
  let ps: Vector[] = [];
  let pOld: Vector[] = [];

  let windSpeed = 0;

  let [width, height] = [p5.windowWidth, p5.windowHeight];
  let canvas: any | null = null;

  p5.setup = () => {
    canvas = p5.createCanvas(width, height);
    for (let i = 0; i < n; i++) {
      ps[i] = p5.createVector(p5.random(width), p5.random(height));
    }
    p5.background(0);
    p5.colorMode(p5.RGB);
  };

  p5.updateWithProps = (props: any) => {
    windSpeed = Number.isNaN(props.windSpeed) ? windSpeed : props.windSpeed;
  };

  p5.draw = () => {
    p5.fill("rgba(0,0,0, 0.01)");
    p5.noStroke();
    p5.rect(0, 0, width, height);
    p5.stroke(255);

    let f0 = 0.002 * p5.frameCount;
    let f1 = 0.02 * p5.frameCount;

    for (let i = 0; i < n; i++) {
      let p = ps[i];
      let ang = p5.noise(0.003 * p.x + f0, 0.003 * p.y) * 4 * p5.PI;
      let v = p5.createVector(
        ((windSpeed * 1.75) / 5) * p5.cos(ang) + (windSpeed / 5) * p5.cos(f1),
        p5.sin(ang)
      );

      pOld[i] = p.copy();
      p.add(v);

      if (
        p5.random(1.0) < 0.01 ||
        p.x < 0 ||
        p.x > width ||
        p.y < 0 ||
        p.y > height
      ) {
        p = p5.createVector(p5.random(width), p5.random(height));
        ps[i] = p;
        pOld[i] = p.copy();
      }

      let magSq = v.magSq();
      p5.strokeWeight(2 + 0.5 / (0.004 + magSq));
      p5.stroke(90, 102, 110);

      p5.line(pOld[i].x, pOld[i].y, p.x, p.y);
    }
  };
}
*/
// versão mais rápida (+velocidade e +suave, porém, c/ efeito pontilhado)

function sketch(p5: P5CanvasInstance<SketchProps & WindLinesRESketchProps>) {
  //inspired by https://openprocessing.org/sketch/894918
  //configured by Lucas Mielle 
  let n = 3100;
  let ps: Vector[] = [];

  let windSpeed = 0;

  let [width, height] = [p5.windowWidth, p5.windowHeight];
  let canvas: any | null = null;

  p5.setup = () => {
    canvas = p5.createCanvas(width, height);
    for (let i = 0; i < n; i++) {
      ps[i] = p5.createVector(p5.random(width), p5.random(height));
    }
    p5.background(0);
    p5.colorMode(p5.RGB);
  };

  p5.updateWithProps = (props: any) => {
    windSpeed = Number.isNaN(props.windSpeed) ? windSpeed : props.windSpeed;
  };

  p5.draw = () => {
    p5.fill("rgba(0, 0, 0, 0.01)");
    p5.noStroke();
    p5.rect(0, 0, width, height);
    p5.stroke(255);

    let f0 = 0.002 * p5.frameCount;
    let f1 = 0.02 * p5.frameCount;

    for (let i = 0; i < n; i++) {
      let p = ps[i];
      let ang = p5.noise(0.003 * p.x + f0, 0.003 * p.y) * 4 * p5.PI;
      let v = p5.createVector(
        ((windSpeed * 1.75) / 5) * p5.cos(ang) + (windSpeed / 5) * p5.cos(f1),
        p5.sin(ang)
      );

      p.add(v);

      if (
        p5.random(1.0) < 0.01 ||
        p.x < 0 ||
        p.x > width ||
        p.y < 0 ||
        p.y > height
      ) {
        p = p5.createVector(p5.random(width), p5.random(height));
        ps[i] = p;
      }

      let magSq = v.magSq();
      p5.strokeWeight(2 + 0.5 / (0.004 + magSq));
      p5.stroke(90, 102, 110);

      p5.point(p.x, p.y);
    }
  };
}

export default function RiverLinesSketch(initialProps: WindLinesRESketchProps) {
  const searchParams = useSearchParams();

  const urlWindSpeed = searchParams?.get("windSpeed");
  const urlPlay = searchParams?.get("play");

  const windSpeed = useMemo(
    () =>
      urlWindSpeed !== null ? Number(urlWindSpeed) : initialProps.windSpeed,
    [urlWindSpeed, initialProps.windSpeed]
  );

  const play =
    urlPlay !== null
      ? urlPlay === "true" || urlPlay === "1"
      : initialProps.play;

  return (
    <NextReactP5Wrapper sketch={sketch} windSpeed={windSpeed} play={play} />
  );
}
