"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type PaintBrushSketchProps = {
  humidity: number;
  play: boolean;
};

function sketch(p5: P5CanvasInstance<SketchProps & PaintBrushSketchProps>) {
  // inspired by: https://openprocessing.org/sketch/1645787
  let rain: Drip[] = [];
  let colors = ["#75b9be", "#696d7d", "#d72638", "#f49d37", "#140f2d"];
  let humidity = 0;

  let play = false;

  let [width, height] = [p5.windowWidth, p5.windowHeight];
  let canvas: any | null = null;

  class Pointer {
    dist: number;
    rad: number;
    speed: number;
    acc: number;
    pos: any;
    finalSize: number;
    downSpeed: any;
    downAcc: any;

    constructor(rad: number, acc: number, finalSize: number) {
      this.dist = 1;
      this.rad = rad;
      this.speed = 0;
      this.acc = acc;
      this.pos = p5.createVector(0, 0);
      this.finalSize = finalSize;
      this.downSpeed = p5.createVector(0, 0.01);
      this.downAcc = p5.createVector(0, 0.05 + this.acc / 500);
    }

    move() {
      if (this.dist <= this.finalSize) {
        this.speed += this.acc;
        this.dist += this.speed;
        this.pos = p5.createVector(
          p5.cos(this.rad) * this.dist,
          p5.sin(this.rad) * this.dist
        );
      } else {
        this.downSpeed.add(this.downAcc);
        this.pos.add(this.downSpeed);
      }
    }
  }

  class Drip {
    splat: Pointer[];
    color: any;
    x: number;
    y: number;
    death: number;
    extent: number;
    noiseStart: number;

    constructor(x: number, y: number, extent: number) {
      this.splat = [];
      this.color = p5.color(p5.random(colors));
      this.x = x;
      this.y = y;
      this.death = 500;
      this.extent = extent;
      this.noiseStart = p5.random(1000);
      for (let i = this.noiseStart; i < this.noiseStart + p5.TWO_PI; i += 0.1) {
        let acc = p5.noise(i);
        this.splat.push(new Pointer(i, acc, extent));
      }
    }

    move() {
      for (let n of this.splat) {
        n.move();
      }
      this.death -= 1;
      if (this.death < 1) {
        let index = rain.indexOf(this);
        rain.splice(index, 1);
      }
    }
    show() {
      p5.noStroke();
      this.color.setAlpha(80);
      p5.fill(this.color);
      p5.push();
      p5.translate(this.x, this.y);
      p5.beginShape();
      for (let i = 0; i < this.splat.length; i++) {
        p5.curveVertex(this.splat[i].pos.x, this.splat[i].pos.y);
      }
      p5.endShape(p5.CLOSE);
      p5.pop();
    }
  }

  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(width, height, p5.P2D);
    p5.background("#f0ead6");
  };

  p5.updateWithProps = (props: any) => {
    humidity = props.humidity;
    play = props.play;

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    let backgroundColor = p5.color("#f0ead6");
    backgroundColor.setAlpha(10);
    p5.background(backgroundColor);

    if (p5.frameCount % 2 == 0) {
      rain.push(
        new Drip(
          p5.random(width),
          p5.random(-100, height),
          p5.random(humidity / 16, (humidity / 16) * 6)
        )
      );
    }

    for (let i = rain.length - 1; i >= 0; i--) {
      rain[i].move();
      rain[i].show();
    }
  };
}

export default function PaintBrushSketch(initialProps: PaintBrushSketchProps) {
  const searchParams = useSearchParams();

  // ler params e converter para número quando existirem
  const urlHumidity = searchParams?.get("humidity");
  const urlPlay = searchParams?.get("play");

  const humidity = useMemo(
    () => (urlHumidity !== null ? Number(urlHumidity) : initialProps.humidity),
    [urlHumidity, initialProps.humidity]
  );

  const play =
    urlPlay !== null
      ? urlPlay === "true" || urlPlay === "1"
      : initialProps.play;

  // passa os valores numéricos ao wrapper p5 — NextReactP5Wrapper chamará updateWithProps internamente
  return <NextReactP5Wrapper sketch={sketch} humidity={humidity} play={play} />;
}
