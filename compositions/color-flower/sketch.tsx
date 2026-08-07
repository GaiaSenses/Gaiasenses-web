"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { useRef } from "react";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type ColorFlowerSketchProps = {
  temperature: number;
  play: boolean;
};

function sketch(p5: P5CanvasInstance<SketchProps & ColorFlowerSketchProps>) {
  // inspired by: https://openprocessing.org/sketch/1929051

  let flowers: Flower[] = [];
  let w = p5.windowWidth;
  let h = p5.windowHeight;
  let maxExtent = Math.max(w, h) * 0.73;
  let play = false;
  let temperature = 0;

  let petalColorsFreezing = [
    "#caf0f8",
    "#ade8f4",
    "#90e0ef",
    "#48cae4",
    "#00b4d8",
    "#0096c7",
    "#0077b6",
    "#023e8a",
    "#03045e",
  ];
  let petalColorsCold = [
    "#4cc9f0",
    "#4895ef",
    "#4361ee",
    "#3f37c9",
    "#3a0ca3",
    "#480ca8",
    "#560bad",
    "#7209b7",
    "#b5179e",
    "#f72585",
  ];
  let petalColorsWarm = [
    "#277da1",
    "#577590",
    "#4d908e",
    "#43aa8b",
    "#90be6d",
    "#f9c74f",
    "#f9844a",
    "#f8961e",
    "#f3722c",
    "#f94144",
  ];
  let petalColorsHot = [
    "#ffba08",
    "#faa307",
    "#f48c06",
    "#e85d04",
    "#dc2f02",
    "#d00000",
    "#9d0208",
    "#6a040f",
    "#370617",
    "#03071e",
  ];
  let petalColorsBurning = [
    "#ffb600",
    "#ffaa00",
    "#ff9e00",
    "#ff9100",
    "#ff8500",
    "#ff7900",
    "#ff6d00",
    "#ff6000",
    "#ff5400",
    "#ff4800",
  ];

  let edgeColors = ["#8c85af", "#5b668f", "#bf7567", "#c99f92", "#527c8e"];

  let petalColors: string[] = [];

  function decideColors(temperature: number) {
    let colors: string[] = [];
    switch (true) {
      case temperature <= 10:
        colors = petalColorsFreezing;
        break;

      case temperature > 10 && temperature <= 19:
        colors = petalColorsCold;
        break;

      case temperature > 19 && temperature <= 25:
        colors = petalColorsWarm;
        break;

      case temperature > 25 && temperature <= 30:
        colors = petalColorsHot;
        break;

      case temperature > 30:
        colors = petalColorsBurning;
        break;
    }

    return colors;
  }
  let canvas: any | null = null;
  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(w, h, p5.WEBGL);

    petalColors = decideColors(temperature);

    flowers.push(new Flower(p5.frameCount));
  };

  p5.updateWithProps = (props: any) => {
    temperature = props.temperature;
    play = props.play;

    petalColors = decideColors(temperature);
    console.log(temperature);
    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    if (p5.frameCount % 75 == 0) {
      flowers.push(new Flower(p5.frameCount));
    }

    for (let i = 0; i < flowers.length; i++) {
      flowers[i].grow();
      flowers[i].show();
    }

    for (let i = flowers.length - 1; i >= 0; i--) {
      flowers[i].end();
    }
  };

  class Flower {
    extent: number;
    n: number;
    nuOfPetals: number;
    edgeColor: any;
    color1: any;
    color2: any;

    constructor(n: number) {
      this.extent = 1;
      this.n = n;
      this.nuOfPetals = p5.floor(p5.random(5, 11));
      this.edgeColor = p5.color(p5.random(edgeColors));
      this.color1 = p5.color(p5.random(petalColors));
      this.color2 = p5.color(p5.random(petalColors));
    }

    grow() {
      let frameMap = p5.map(p5.frameCount, this.n, this.n + 625, 0, 1);
      let sizer = easeInOutSine(frameMap);
      this.extent = p5.map(sizer, 0, 1, 0, maxExtent);
    }

    show() {
      //noisy arcs painting
      let ps = p5.TAU / this.nuOfPetals;
      p5.strokeWeight(2);
      p5.stroke(this.edgeColor);
      for (let i = this.n; i < p5.TAU + this.n; i += ps * 0.75) {
        let mixer = p5.noise(this.n, i / 10, p5.frameCount / 105);
        let f = p5.lerpColor(this.color1, this.color2, mixer);
        let shader = p5.color("#fffff");
        let shade = p5.map(this.extent, 0, w * 0.1, 0.4, 1);
        let ff = p5.lerpColor(shader, f, shade);
        p5.fill(ff);
        p5.push();

        p5.translate(p5.width / 2, p5.height / 2);
        p5.rotate(i);
        let xamount = this.extent / this.nuOfPetals;
        let xoff = p5.map(
          1,
          (this.n, i, p5.frameCount / 50),
          -1,
          1,
          -xamount,
          !!xamount,
        );
        let yoff = p5.map(
          1,
          (this.n, i, p5.frameCount / 50 - 0.2),
          -1,
          1,
          -xamount / 5,
          !!(xamount / 5),
        );
        p5.arc(
          xoff,
          this.extent + yoff,
          this.extent,
          this.extent,
          p5.PI / 2 - ps * 1.1,
          p5.PI / 2 + ps * 1.1,
          p5.OPEN,
        );
        p5.pop();
      }
    }

    end() {
      if (this.extent > maxExtent * 0.97) {
        let index = flowers.indexOf(this);
        flowers.splice(index, 1);
      }
    }
  }

  function easeInOutSine(x: number) {
    return -(Math.cos(Math.PI * x) - 1) / 2;
  }
}

export default function ColorFlowerSketch({
  temperature,
  play,
}: ColorFlowerSketchProps) {
  const searchParams = useSearchParams();

  // Lê os parâmetros da URL
  const urlTemperature = searchParams?.get("temperature");
  const urlPlay = searchParams?.get("play");

  // Prioriza valores da URL se existirem
  const temperatureValue = useMemo(
    () => (urlTemperature !== null ? Number(urlTemperature) : temperature),
    [urlTemperature, temperature],
  );
  const playValue =
    urlPlay !== null ? urlPlay === "true" || urlPlay === "1" : play;

  return (
    <NextReactP5Wrapper
      sketch={sketch}
      temperature={temperatureValue}
      play={playValue}
    />
  );
}
