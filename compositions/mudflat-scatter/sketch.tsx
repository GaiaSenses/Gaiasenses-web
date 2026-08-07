"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import type { Color, Vector } from "p5";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

//for the #wccChallenge on the theme of 'flat'.
//Thought I would be skipping this week, as I'm on vacation in northern California.
//But, I found myself walking across a beach at low tide on some mud flats
//and saw all sorts of interesting patterns made by the retreating water.

//This was a quick attempt to recreate some of them with particles drawing across
//the canvas and scattering around debris.
//code by Aaron Reuland
// from https://openprocessing.org/sketch/1982410

export type MudFlatScatterSketchProps = {
  temperature: number;
  windDeg: number;
  windSpeed: number;
  play: boolean;
};

function sketch(p5: P5CanvasInstance<SketchProps>) {
  let stroker: Color;
  let beach: Sand[] = [];
  let stones: { pos: Vector; r: number }[] = [];
  let play = false;

  let [w, h] = [p5.windowWidth, p5.windowHeight];

  p5.setup = () => {
    p5.createCanvas(w, h);
    p5.pixelDensity(1);
    p5.background("#474843");
    stroker = p5.color("#eeeff0");
    stroker.setAlpha(30);
    for (let y = -50; y < p5.height + 50; y += p5.random(80, 120)) {
      let x = p5.map(
        p5.noise(y / 10),
        0,
        1,
        p5.width / 6,
        p5.width - p5.width / 4
      );
      let stone = {
        pos: p5.createVector(x, y),
        r: p5.random(p5.height / 70, p5.height / 12),
      };
      stones.push(stone);
    }

    for (let y = -p5.height / 10; y < p5.height + p5.height / 10; y++) {
      beach.push(new Sand(-10, y + p5.random(-1, 1)));
    }
  };

  p5.updateWithProps = (props: any) => {
    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    if (p5.frameCount < 200 && p5.frameCount % 8 == 0) {
      for (let y = -p5.height / 10; y < p5.height + p5.height / 4; y++) {
        beach.push(new Sand(-10, y));
      }
    }

    for (let i = beach.length - 1; i >= 0; i--) {
      beach[i].move();
      beach[i].show();
      beach[i].end();
    }
  };

  class Sand {
    pos: Vector;
    acc: Vector;
    vel: Vector;
    constructor(x: number, y: number) {
      this.pos = p5.createVector(x, y);
      this.acc = p5.createVector(p5.random(0.002, 0.005), 0);
      this.vel = p5.createVector(0, 0);
    }

    move() {
      for (const element of stones) {
        let d = this.pos.dist(element.pos);
        this.pos.dist(stones[1].pos);
        if (d <= element.r) {
          let yvOff = (this.pos.y - element.pos.y) * -2;
          this.acc.add(0, yvOff);
        }
      }
      let yoff = p5.map(
        p5.noise(p5.frameCount / 50, this.pos.x / 10, this.pos.y / 50),
        0,
        1,
        -0.002,
        0.002
      );
      this.acc.add(0, yoff);
      this.vel.add(this.acc);
      this.pos.add(this.vel);
    }

    show() {
      p5.stroke(stroker);

      p5.point(this.pos.x, this.pos.y);
    }

    end() {
      if (
        this.pos.x > p5.width + 1 ||
        this.pos.y < -p5.height / 10 ||
        this.pos.y > p5.height + p5.height / 10
      ) {
        let index = beach.indexOf(this);
        beach.splice(index, 1);
      }
    }
  }
}

export default function MudFlatScatterSketch(
  initialProps: MudFlatScatterSketchProps
) {
  const searchParams = useSearchParams();

  // ler params e converter para número quando existirem
  const urlTemp = searchParams?.get("temperature");
  const urlWindDeg = searchParams?.get("windDeg");
  const urlWindSpeed = searchParams?.get("windSpeed");
  const urlPlay = searchParams?.get("play");

  const temperature = useMemo(
    () => (urlTemp !== null ? Number(urlTemp) : initialProps.temperature),
    [urlTemp, initialProps.temperature]
  );

  const windDeg = useMemo(
    () => (urlWindDeg !== null ? Number(urlWindDeg) : initialProps.windDeg),
    [urlWindDeg, initialProps.windDeg]
  );

  const windSpeed = useMemo(
    () =>
      urlWindSpeed !== null ? Number(urlWindSpeed) : initialProps.windSpeed,
    [urlWindSpeed, initialProps.windSpeed]
  );

  const play =
    urlPlay !== null
      ? urlPlay === "true" || urlPlay === "1"
      : initialProps.play;

  // passa os valores numéricos ao wrapper p5 — NextReactP5Wrapper chamará updateWithProps internamente
  return (
    <NextReactP5Wrapper
      sketch={sketch}
      temperature={temperature}
      windDeg={windDeg}
      windSpeed={windSpeed}
      play={play}
    />
  );
}
