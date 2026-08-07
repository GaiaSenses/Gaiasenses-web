"use client";
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
import { NextReactP5Wrapper } from "@p5-wrapper/next";

export type ExemploClimaProps = {
  play: boolean;
  temperature: number;
  rain: number;
};

function sketch(p5: P5CanvasInstance<SketchProps & ExemploClimaProps>) {
  let temperature = 0;
  let rain = 0;
  let play = false;

  p5.setup = () => {
    p5.createCanvas(p5.windowWidth, p5.windowHeight);
    p5.colorMode(p5.HSB, 255);
    p5.noStroke();
    if (!play) p5.noLoop();
  };

  p5.updateWithProps = (props: ExemploClimaProps) => {
    if (!Number.isNaN(props.temperature)) temperature = props.temperature;
    if (!Number.isNaN(props.rain)) rain = props.rain;
    play = props.play;
    if (play) p5.loop();
    else p5.noLoop();
  };

  p5.draw = () => {
    const matiz = p5.map(temperature, -10, 45, 160, 0, true);
    p5.background(matiz, 180, 90);
    p5.fill(matiz, 60, 255);
    for (let i = 0; i < rain * 4; i++) {
      p5.circle(p5.random(p5.width), p5.random(p5.height), 3);
    }
  };
}

export default function ExemploClimaSketch(props: ExemploClimaProps) {
  return <NextReactP5Wrapper sketch={sketch} {...props} />;
}
