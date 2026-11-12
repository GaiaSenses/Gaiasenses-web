"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { acompanharJanela } from "@/lib/p5-canvas-fit";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type BurningTreesSketchProps = {
  fireCount: number;
  play: boolean;
};

function sketch(p5: P5CanvasInstance<SketchProps & BurningTreesSketchProps>) {
  //inspired by https://openprocessing.org/sketch/1749652
  //configured by Lucas Mielle  
  let t = 0;
  let fireCount = 0;
  let W: number;
  let C: number;
  let T: number;
  let play = false;

  p5.setup = () => {
    p5.createCanvas(p5.windowWidth, p5.windowHeight);
    W = p5.windowWidth;
    p5.colorMode(p5.HSB);
    // O canvas passa a acompanhar a caixa onde vive: sem isto ele
    // guarda para sempre o tamanho que a janela tinha no instante em
    // que a obra abriu. Ver lib/p5-canvas-fit.ts.
    acompanharJanela(p5, (largura, altura) => {
      p5.resizeCanvas(largura, altura);
      W = p5.width;
    });
  };

  p5.updateWithProps = (props: any) => {
    const count = Number.isNaN(props.fireCount) ? fireCount : props.fireCount;
    play = props.play;
    fireCount = count;
  };

  p5.draw = () => {
    t++;
    W = p5.windowWidth;
    C = Math.floor(t / 32) * 32;

    p5.blendMode(p5.BLEND);
    p5.background(0, 0.05);
    p5.blendMode(p5.ADD);

    if (fireCount === 0) {
      // Primeiro laço for
      for (let y = 0; y <= W; y += 16) {
        for (let x = ((y / 16) % 2) * -9; x <= W; x += 18) {
          T = Math.tan(p5.noise(x / W, (y + C) / W) * 15 - t / 99);

          p5.fill(120, 100, 100, T > 0.2 ? T : 0.5); // Cor verde
          p5.circle(x, y - 0 / T - (t % 32), 9); // Tamanho fixo
        }
      }
    } else {
      // Segundo laço for
      for (let y = 0; y <= W; y += 16) {
        for (let x = ((y / 16) % 2) * -9; x <= W; x += 18) {
          T = Math.tan(p5.noise(x / W, (y + C) / W) * 15 - t / 99);

          if (T > 0.2 + fireCount - 1) {
            p5.fill(120, 100, 100, T); // Cor verde
          } else {
            p5.fill(p5.noise(x, y + C) * 30, 100, 1); // Cor das chamas
          }
          p5.circle(x, y - 2 / T - (t % 32), T > 0.2 ? 9 : 3 / T); // Controla os círculos
        }
      }
    }
  };

}

export default function BurningTreesSketch(
  initialProps: BurningTreesSketchProps
) {
  const searchParams = useSearchParams();

  // ler params e converter para número quando existirem
  const urlFireCount = searchParams?.get("fireCount");
  const urlPlay = searchParams?.get("play");

  const fireCount = useMemo(
    () =>
      urlFireCount !== null ? Number(urlFireCount) : initialProps.fireCount,
    [urlFireCount, initialProps.fireCount]
  );

  const play =
    urlPlay !== null
      ? urlPlay === "true" || urlPlay === "1"
      : initialProps.play;

  // passa os valores numéricos ao wrapper p5 — NextReactP5Wrapper chamará updateWithProps internamente
  return (
    <NextReactP5Wrapper sketch={sketch} fireCount={fireCount} play={play} />
  );
}
