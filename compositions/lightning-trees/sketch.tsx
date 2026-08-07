"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type LightningTreesSketchProps = {
  lightningCount: number;
  play: boolean;
};

function sketch(p5: P5CanvasInstance<SketchProps & LightningTreesSketchProps>) {
  // inspired by: https://openprocessing.org/sketch/1203202
  let colors = ["#793FDF", "#5800FF", "#2FA4FF", "#72FFFF"];
  let r: number;
  let w: number;
  let k = 30;
  let grid: (any | undefined)[][] = [];
  let active: { pos: any; color: string }[] = [];
  let nCols: number;
  let nRows: number;
  let lightningCount = 0;
  let speed = 0;

  let play = false;

  let [width, height] = [p5.windowWidth, p5.windowHeight];
  let canvas: any | null = null;

  const initialize = () => {
    if (lightningCount == 0) {
      r = 25;
      speed = 1;
    } else if (lightningCount >= 50) {
      r = 5;
      speed = 50;
    } else {
      r = p5.round(lightningCount / 5 + 5);
      speed = lightningCount;
    }

    p5.background("#000000");
    p5.strokeWeight(r * 0.5);
    p5.strokeCap(p5.ROUND);
    w = r / p5.sqrt(2);

    grid = [];
    active = [];

    nCols = p5.round(width / w);
    nRows = p5.round(height / w);
    for (let i = 0; i < nRows; i++) {
      let newRow = [];
      for (let j = 0; j < nCols; j++) {
        newRow.push(undefined);
      }
      grid.push(newRow);
    }

    let nColors = colors.length;
    for (let n = 0; n < nColors; n++) {
      let p = p5.createVector(p5.random(width), p5.random(height));
      let j = p5.round(p.x / w);
      let i = p5.round(p.y / w);
      let pos = p5.createVector(p.x, p.y);
      if (grid[i] && grid[i][j]) {
        grid[i][j] = pos;
        active.push({
          pos: pos,
          color: colors[n],
        });
      }
    }
  };

  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(width, height, p5.P2D);

    initialize();
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

    console.log(`lightningCount: ${lightningCount}`);

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    for (var total = 0; total < speed; total++) {
      if (active.length > 0) {
        let randIndex = p5.floor(p5.random(active.length));
        let pos = active[randIndex].pos;
        let color = active[randIndex].color;
        let found = false;
        for (var n = 0; n < k; n++) {
          // to access Vector's static methods through P5-Wrapper
          // we need p5.constructor
          // https://github.com/P5-wrapper/react/issues/42#issuecomment-633108409
          // @ts-ignore
          let sample = p5.constructor.Vector.random2D();
          let m = p5.random(r, 8 * r);
          sample.setMag(m);
          sample.add(pos);

          let col = p5.round(sample.x / w);
          let row = p5.round(sample.y / w);

          if (
            col > -1 &&
            row > -1 &&
            col < nCols &&
            row < nRows &&
            !grid[col + row * nCols]
          ) {
            var ok = true;
            for (
              var i = p5.max(row - 1, 0);
              i <= p5.min(row + 1, nRows - 1);
              i++
            ) {
              for (
                var j = p5.max(col - 1, 0);
                j <= p5.min(col + 1, nRows - 1);
                j++
              ) {
                let neighbor = grid[i][j];
                if (neighbor) {
                  // @ts-ignore
                  let d = p5.constructor.Vector.dist(sample, neighbor);
                  if (d < r) {
                    ok = false;
                  }
                }
              }
            }
            if (ok) {
              found = true;
              grid[row][col] = sample;
              active.push({
                pos: sample,
                color: color,
              });
              p5.stroke(color);
              p5.line(sample.x, sample.y, pos.x, pos.y);
              break;
            }
          }
        }

        if (!found) {
          active.splice(randIndex, 1);
        }
      }
    }
  };
}

export default function LightningTreesSketch(
  initialProps: LightningTreesSketchProps,
) {
  const searchParams = useSearchParams();

  // ler params e converter para número quando existirem
  const urlLightningCount = searchParams?.get("lightningCount");
  const urlPlay = searchParams?.get("play");

  const lightningCount = useMemo(
    () =>
      urlLightningCount !== null
        ? Number(urlLightningCount)
        : initialProps.lightningCount,
    [urlLightningCount, initialProps.lightningCount],
  );

  const play =
    urlPlay !== null
      ? urlPlay === "true" || urlPlay === "1"
      : initialProps.play;


  // passa os valores numéricos ao wrapper p5 — NextReactP5Wrapper chamará updateWithProps internamente
  return (
    <NextReactP5Wrapper
      sketch={sketch}
      lightningCount={lightningCount}
      play={play}
    />
  );
}
