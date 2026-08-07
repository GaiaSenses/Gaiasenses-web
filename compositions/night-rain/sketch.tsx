"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Map, map } from "leaflet";

export type NightRainSketchProps = {
  play: boolean;
  rain: number;
  temperature: number;
};

function sketch(p5: P5CanvasInstance<SketchProps & NightRainSketchProps>) {
  //inspired by https://openprocessing.org/sketch/2318784
  //configured by Lucas Mielle 
  let particles = [];
  let rain = 0; //Precipitation, mm / 1h.
  let temperature = 0;
  let play = false;

  let [width, height] = [p5.windowWidth, p5.windowHeight];
  let canvas: any | null = null;

  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(width, height, p5.P2D);
    p5.colorMode(p5.HSB, 255);
    p5.ellipseMode(p5.RADIUS);
    p5.noFill();
  };

  p5.updateWithProps = (props: any) => {
    rain = Number.isNaN(props.rain) ? rain : props.rain;
    temperature = Number.isNaN(props.temperature)
      ? temperature
      : props.temperature;
    play = props.play;

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    p5.background(0, 30);

    if (particles.length < 14 * rain) particles.push(new Particle());
    //if (particles.length < 3 * rain) particles.push(new Particle());

    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].display();
    }
  };

  class Particle {
    x: number;
    y: number;
    vy: number;
    maxy: number;
    r: number;
    tr: number;
    w: number;

    constructor() {
      this.x = 0;
      this.y = 0;
      this.vy = p5.random(
        p5.map(rain, 0, 60, 8, 18),
        p5.map(rain, 0, 60, 18, 30)
      );
      this.maxy = 0;
      this.r = 10;
      this.tr = 50;
      this.w = 0;
      this.reset();
    }

    reset() {
      this.x = p5.random(width);
      this.y = p5.random(-150, 0);
      this.vy = p5.random(8, 30);
      this.maxy = this.y + height;
      this.r = 10;
      this.tr = 50;
      this.w = p5.random(1, 3);
    }

    update() {
      if (this.y < this.maxy) {
        this.y += this.vy;
      } else {
        this.r++;
      }
      if (this.r > this.tr) this.reset();
    }

    display() {
      p5.strokeWeight(0.5);
      let hueValue = p5.map(temperature, 1, 35, 160, 0);
      p5.stroke(hueValue, 255, 255);

      if (this.y < this.maxy) {
        p5.push();
        p5.translate(this.x, this.y);
        p5.beginShape();
        p5.strokeWeight(1);
        p5.vertex(0, -5);
        p5.quadraticVertex(3, 0, 0, 1);
        p5.quadraticVertex(-3, 0, 0, -5);
        p5.endShape(p5.CLOSE);
        p5.pop();
      } else {
        p5.stroke(hueValue, 255, 255, p5.map(this.r, 0, this.tr, 180, 130));
        p5.ellipse(this.x, this.y, this.r, this.r * 0.5);
      }
    }
  }
}

export default function NightRainSketch(initialProps: NightRainSketchProps) {
  const searchParams = useSearchParams();

  // ler params e converter para número quando existirem
  const urlRain = searchParams?.get("rain");
  const urlTemperature = searchParams?.get("temperature");
  const urlPlay = searchParams?.get("play");

  const rain = useMemo(
    () => (urlRain !== null ? Number(urlRain) : initialProps.rain),
    [urlRain, initialProps.rain]
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
      rain={rain}
      temperature={temperature}
      play={play}
    />
  );
}

function random(arg0: Map, arg1: Map): number {
  throw new Error("Function not implemented.");
}
