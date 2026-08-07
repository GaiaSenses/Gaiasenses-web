"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type ZigZagSketchProps = {
  rain: number;
  lightningCount: number;
  play: boolean;
};

type Agent = {
  pos: any;
  oldPos: any;
  color: any;
  strokeWidth: number;
};

const FPS_MIN = 15;
const FPS_MAX = 60;

const AGENTS_MIN = 10;
const AGENTS_MAX = 200;

const CRITICAL_RAIN = 10;
const CRITICAL_LIGHTNING = 10;

let fps = 0;

const colors = ["#af0f0f", "#feb30f", "#0aa4f7", "#000000", "#ffffff"];
const weights = [1, 1, 1, 1, 1];

let agents: Agent[] = [];
let nAgents = 0;
let speed = 10;
let step = 2;
let direction = 1;

function sketch(p5: P5CanvasInstance<SketchProps & ZigZagSketchProps>) {
  // inspired by: https://openprocessing.org/sketch/1643288

  let lightningCount = 0;
  let rain = 0;

  let play = false;

  let [width, height] = [p5.windowWidth, p5.windowHeight];

  function createAgent(x: number, y: number): Agent {
    return {
      pos: p5.createVector(x, y),
      oldPos: p5.createVector(x, y),
      color: generateColor(),
      strokeWidth: 5,
    };
  }

  function updateAgent(agent: Agent) {
    agent.pos.x +=
      direction * vectorField(agent.pos.x, agent.pos.y).x * step + 1;
    agent.pos.y += direction * vectorField(agent.pos.x, agent.pos.y).y * step;

    agent.strokeWidth = p5.map(agent.pos.y, 0, height, 5, 1);

    if (agent.pos.y >= height) {
      agent.pos.y = 0;
      agent.color = generateColor();
      agent.strokeWidth = 5;
      agent.oldPos.set(agent.pos);
    }
    if (agent.pos.x > width || agent.pos.x < 0) {
      agent.pos.x = agent.pos.x < 0 ? width : 0;
      agent.oldPos.set(agent.pos);
    }

    p5.strokeWeight(agent.strokeWidth);
    p5.stroke(agent.color);
    p5.line(agent.oldPos.x, agent.oldPos.y, agent.pos.x, agent.pos.y);

    agent.oldPos.set(agent.pos);
  }

  function vectorField(x: number, y: number) {
    x = p5.map(x, 0, width, -speed - 10, speed + 10);
    y = p5.map(y, 0, height, -speed - 10, speed + 10);

    let k1 = 5;
    let k2 = 3;

    let u = Math.sin(k1 * y) + Math.floor(Math.cos(k2 * y));
    let v = Math.sin(k2 * x) - Math.cos(k1 * x);

    // litle trick to move from left to right
    if (v <= 0) {
      v = -v * 0.3;
    }
    return p5.createVector(u, v);
  }

  function generateColor() {
    let temp = randomColor();

    return p5.color(
      p5.hue(temp) + p5.randomGaussian() * speed,
      p5.saturation(temp) + p5.randomGaussian() * speed,
      p5.brightness(temp) - speed,
      p5.random(10, 100)
    );
  }

  function randomColor() {
    let sum = weights.reduce((prev, cur) => prev + cur);
    let target = p5.random(0, sum);

    for (let i = 0; i < weights.length; i++) {
      const weight = weights[i];

      if (weight >= target) {
        return colors[i];
      }
      target -= weight;
    }
    return colors[0];
  }

  function initialize() {
    nAgents = Math.floor(
      p5.map(
        lightningCount,
        0,
        CRITICAL_LIGHTNING,
        AGENTS_MIN,
        AGENTS_MAX,
        true
      )
    );
    fps = p5.map(rain, 0, CRITICAL_RAIN, FPS_MIN, FPS_MAX, true);

    p5.background(0);
    p5.frameRate(fps);

    for (let i = 0; i < nAgents / 3; i++) {
      agents.push(createAgent(p5.randomGaussian() * 200, 0));
      agents.push(createAgent(width * 0.5 + p5.randomGaussian() * 200, 0));
      agents.push(createAgent(width * 1.0 + p5.randomGaussian() * 200, 0));
    }
  }
  let canvas: any | null = null;
  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(width, height);
    p5.colorMode(p5.HSB, 360, 100, 100);
    p5.rectMode(p5.CENTER);
    p5.strokeCap(p5.SQUARE);
    initialize();
  };

  p5.updateWithProps = (props: any) => {
    rain = props.rain;
    lightningCount = props.lightningCount;
    play = props.play;

    initialize();

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
      agents = [];
    }
  };

  p5.draw = () => {
    if (p5.frameCount > 10000) {
      p5.noLoop();
    }

    for (let i = 0; i < agents.length; i++) {
      updateAgent(agents[i]);
    }

    p5.stroke(0, 0, 100);
    p5.noFill();
    p5.strokeWeight(20);
  };

  p5.windowResized = () => {
    width = p5.windowWidth;
    height = p5.windowHeight;
    p5.resizeCanvas(width, height);
  };

  return false;
}

export default function ZigZagSketch({
  rain,
  lightningCount,
  play,
}: ZigZagSketchProps) {
  const searchParams = useSearchParams();

  // Lê os parâmetros da URL
  const urlRain = searchParams?.get("rain");
  const urlLightningCount = searchParams?.get("lightningCount");
  const urlPlay = searchParams?.get("play");

  // Prioriza valores da URL se existirem
  const rainValue = useMemo(
    () => (urlRain !== null ? Number(urlRain) : rain),
    [urlRain, rain]
  );
  const lightningCountValue = useMemo(
    () =>
      urlLightningCount !== null ? Number(urlLightningCount) : lightningCount,
    [urlLightningCount, lightningCount]
  );
  const playValue =
    urlPlay !== null ? urlPlay === "true" || urlPlay === "1" : play;

  return (
    <NextReactP5Wrapper
      sketch={sketch}
      rain={rainValue}
      lightningCount={lightningCountValue}
      play={playValue}
    />
  );
}
