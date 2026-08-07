"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import p5 from "p5";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type RiverLinesSketchProps = {
  humidity: number;
  temperature: number;
  play: boolean;
};

function sketch(p5: P5CanvasInstance<SketchProps & RiverLinesSketchProps>) {
  //inspired by https://openprocessing.org/sketch/1198771
  //configured by Lucas Mielle 
  let objs: Obj[] = [];
  let humidity = 0;
  let temperature = 0;
  let play = false;
  let palette: p5.Color[] = [];

  function getDynamicPalette(temperature: number): p5.Color[] {
    let hueValueStart = p5.map(temperature, -5, 30, 210, 0);
    let colors: p5.Color[] = [];
    for (let i = 0; i < 6; i++) {
      let hue = (hueValueStart + i * 8) % 360;
      colors.push(p5.color(hue, 100, 100));
    }
    return colors;
  }

  function initializeObjects() {
    objs = [];
    palette = getDynamicPalette(temperature);
    const count = Math.max(0, Math.floor(humidity));
    for (let i = 0; i < count; i++) {
      objs.push(new Obj(i));
    }
  }

  p5.setup = () => {
    p5.createCanvas(p5.windowWidth, p5.windowHeight);
    p5.angleMode(p5.DEGREES);
    p5.noFill();
    p5.colorMode(p5.HSB, 360, 100, 300);
    p5.background(20);

    initializeObjects();

    if (!play) p5.noLoop();
  };

  p5.updateWithProps = (props: any) => {
    let needsUpdate = false;

    const h = Number(props.humidity);
    const t = Number(props.temperature);

    if (Number.isFinite(h) && h !== humidity) {
      humidity = Math.max(0, Math.floor(h));
      needsUpdate = true;
    }
    if (Number.isFinite(t) && t !== temperature) {
      temperature = t;
      needsUpdate = true;
    }

    if (typeof props.play === "string") {
      play = props.play === "true";
    } else if (typeof props.play === "boolean") {
      play = props.play;
    }

    if (needsUpdate) {
      initializeObjects();
    }

    if (play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    p5.blendMode(p5.BLEND);
    p5.background(20, 50);
    p5.blendMode(p5.ADD);

    for (let obj of objs) {
      obj.move();
      obj.display();
    }
  };

  class Obj {
    index: number;
    startY: number;
    goalY: number;
    rangeY: number;
    step: number;
    strWeight: number;
    c: p5.Color;

    constructor(tmpIndex: number) {
      this.index = tmpIndex;
      const denom = Math.max(1, humidity - 1);
      this.startY = p5.map(tmpIndex, 0, denom, p5.height, 0);
      this.rangeY = p5.random(100, 200);
      this.step = p5.random(10, 20);
      this.strWeight = p5.random(10, 20);
      this.c = p5.color(palette[Math.floor(p5.random(palette.length))]);
      this.c.setAlpha(50);
      this.goalY = this.startY - this.rangeY;
    }

    move() {
      this.startY -= this.step;
      this.goalY = this.startY - this.rangeY;

      if (this.startY + this.rangeY < 0) {
        this.startY = p5.height;
        this.goalY = this.startY - this.rangeY;
      }
    }

    display() {
      p5.strokeWeight(this.strWeight);
      p5.stroke(this.c);
      p5.beginShape();
      for (let y = this.startY; y >= this.goalY; y -= 1) {
        let x = p5.map(
          p5.noise(y * 0.0005, this.index * 0.0075, p5.frameCount * 0.002),
          0,
          1,
          -p5.width * 0.25,
          p5.width * 1.25
        );
        p5.vertex(x, y);
      }
      p5.endShape();
    }
  }
}

export default function RiverLinesSketch(initialProps: RiverLinesSketchProps) {
  const searchParams = useSearchParams();

  // ler params e converter para número quando existirem
  const urlHumidity = searchParams?.get("humidity");
  const urlTemperature = searchParams?.get("temperature");
  const urlPlay = searchParams?.get("play");

  const humidity = useMemo(
    () => (urlHumidity !== null ? Number(urlHumidity) : initialProps.humidity),
    [urlHumidity, initialProps.humidity]
  );

  const temperature = useMemo(
    () =>
      urlTemperature !== null
        ? Number(urlTemperature)
        : initialProps.temperature,
    [urlTemperature, initialProps.temperature]
  );

  const play =
    urlPlay !== null
      ? urlPlay === "true" || urlPlay === "1"
      : initialProps.play;

  // passa os valores numéricos ao wrapper p5 — NextReactP5Wrapper chamará updateWithProps internamente
  return (
    <NextReactP5Wrapper
      sketch={sketch}
      humidity={humidity}
      temperature={temperature}
      play={play}
    />
  );
}
