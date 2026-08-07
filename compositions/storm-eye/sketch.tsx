"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type StormEyeSketchProps = {
  temperature: number;
  windDeg: number;
  windSpeed: number;
  play: boolean;
};

function sketch(p5: P5CanvasInstance<SketchProps & StormEyeSketchProps>) {
  // inspired by: https://openprocessing.org/sketch/1936782

  let eyeRadius = 0.2;
  let distribution = 1.0;
  let length = 0.1;
  let lengthEvo = 1.3;
  let respawnFactor = 0.03;

  let play = false;
  let containerHeight = 0;

  var n = 200;
  var vents: Vent[] = [];

  let windColorFreezing = [
    "#caf0f8",
    "#ade8f4",
    "#90e0ef",
    "#48cae4",
    "#00b4d8",
    "#0096c7",
  ];
  let windColorCold = [
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
  let windColorWarm = [
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
  let windColorHot = [
    "#ffba08",
    "#faa307",
    "#f48c06",
    "#e85d04",
    "#dc2f02",
    "#d00000",
    "#9d0208",
  ];
  let windColorBurning = [
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

  let temperature = 0;
  let speedFactor = 0;
  let eyeVariance = 0;

  let canvas = null;

  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(p5.windowWidth, p5.windowHeight);
    // for (let i = 0; i < n; i++) {
    //   vents.push(new Vent());
    // }
  };

  p5.updateWithProps = (props: any) => {
    temperature = props.temperature;
    speedFactor = props.windSpeed / 100;
    eyeVariance = props.windDeg / 1000;
    play = props.play;

    for (let i = 0; i < n; i++) {
      vents.push(new Vent());
    }

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    p5.background(0);
    if (vents.length > 0) {
      for (let i = 0; i < n; i++) {
        vents[i].show();
        vents[i].move();
      }
    }
  };

  class Vent {
    x: number;
    y: number;
    rx: number;
    ry: number;
    a: number;
    la: number;
    c: any;
    s: number;
    constructor() {
      this.x = 0;
      this.y = 0;
      this.rx = 0;
      this.ry = 0;
      this.a = 0;
      this.la = 0;
      this.s = 0;
      this.c = 0;

      this.initialize();
    }

    initialize() {
      let windColor: string[] = [];

      switch (true) {
        case temperature <= 10:
          windColor = windColorFreezing;
          break;

        case temperature > 10 && temperature <= 19:
          windColor = windColorCold;
          break;

        case temperature > 19 && temperature <= 25:
          windColor = windColorWarm;
          break;

        case temperature > 25 && temperature <= 30:
          windColor = windColorHot;
          break;

        case temperature > 30:
          windColor = windColorBurning;
          break;
      }

      var centerR = p5.random(0, eyeVariance * p5.width);
      var centerA = p5.random(0, 2 * p5.PI);
      this.x = p5.width / 2.0 + centerR * p5.cos(centerA);
      this.y = p5.height / 2.0 + centerR * p5.sin(centerA);

      var radiusRow =
        eyeRadius * p5.width +
        p5.pow(
          p5.random(
            0,
            p5.pow(p5.width - eyeRadius * p5.width * 2.0, distribution)
          ),
          1.0 / distribution
        );
      this.rx = radiusRow * p5.random(0.8, 1.2);
      this.ry = radiusRow * p5.random(0.8, 1.2);

      this.a = p5.random(0, 2 * p5.PI);

      this.la =
        (p5.pow(length * p5.width, lengthEvo) / radiusRow) *
        p5.random(0.8, 1.2);

      this.c = p5.color(p5.random(windColor));

      this.s = speedFactor * p5.random(0.8, 1.2);
    }

    show() {
      p5.noFill();
      p5.stroke(this.c);
      p5.arc(this.x, this.y, this.rx, this.ry, this.a, this.a + this.la);
    }

    move() {
      this.a += this.s;
      var r = p5.random(0, 1);
      if (r < respawnFactor) {
        this.initialize();
      }
    }
  }
}

export default function StormEyeSketch({
  windDeg,
  windSpeed,
  temperature,
  play,
}: StormEyeSketchProps) {
  const searchParams = useSearchParams();

  // Lê os parâmetros da URL
  const urlTemperature = searchParams?.get("temperature");
  const urlWindDeg = searchParams?.get("windDeg");
  const urlWindSpeed = searchParams?.get("windSpeed");
  const urlPlay = searchParams?.get("play");

  // Prioriza valores da URL se existirem
  const temperatureValue = useMemo(
    () => (urlTemperature !== null ? Number(urlTemperature) : temperature),
    [urlTemperature, temperature]
  );
  const windDegValue = useMemo(
    () => (urlWindDeg !== null ? Number(urlWindDeg) : windDeg),
    [urlWindDeg, windDeg]
  );
  const windSpeedValue = useMemo(
    () => (urlWindSpeed !== null ? Number(urlWindSpeed) : windSpeed),
    [urlWindSpeed, windSpeed]
  );
  const playValue =
    urlPlay !== null ? urlPlay === "true" || urlPlay === "1" : play;

  return (
    <NextReactP5Wrapper
      sketch={sketch}
      windSpeed={windSpeedValue}
      windDeg={windDegValue}
      temperature={temperatureValue}
      play={playValue}
    />
  );
}
