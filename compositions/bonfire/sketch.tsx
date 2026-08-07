"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type BonfireSketchProps = {
  fireCount: number;
  play: boolean;
};

function sketch(p5: P5CanvasInstance<SketchProps & BonfireSketchProps>) {
  // creator: Pedro Trama
  let fireCount = 0;
  let nParticles = 3;
  let particles: Particle[] = [];
  let [red, green, blue] = [0, 0, 0];
  let play = false;

  let [width, height] = [p5.windowWidth, p5.windowHeight];
  let canvas: any | null = null;

  class Particle {
    x: number;
    y: number;
    radius: number;
    red: number;
    green: number;
    blue: number;
    alpha: number;

    constructor() {
      this.x = p5.random(width);
      this.y = height;
      this.radius = p5.floor(p5.random(10, 30));
      this.red = red;
      this.green = green;
      this.blue = blue;
      this.alpha = p5.random(100, 500);
    }

    update() {
      this.y -= p5.random(1, 3);
      this.radius -= p5.random(7, 10) / 100;
      this.green += 0.5;
    }

    display() {
      p5.fill(this.red, this.green, this.blue, this.alpha);
      p5.noStroke();
      p5.ellipse(this.x, this.y, this.radius, this.radius);
    }

    isFinished() {
      return this.radius <= 0;
    }
  }

  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(width, height, p5.P2D);
  };

  p5.updateWithProps = (props: any) => {
    fireCount = Number.isNaN(props.fireCount) ? fireCount : props.fireCount;
    nParticles = fireCount;
    play = props.play;

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    p5.background(0);

    //colors and number of particles
    if (fireCount == 0) {
      nParticles = 3;
      red = 0;
      green = 255;
      blue = p5.floor(p5.random(0, 255));
    } else if (nParticles >= 1 && nParticles <= 19) {
      red = 255;
      green = p5.floor(p5.random(0, 255));
      blue = 0;
    } else if (nParticles >= 20) {
      nParticles = 20;
      red = 255;
      green = p5.floor(p5.random(0, 255));
      blue = 0;
    }

    //creates new particles
    for (let i = 0; i < nParticles; i++) {
      particles.push(new Particle());
    }

    //moves, shrinks and changes particle's colors
    for (let particle of particles) {
      particle.update();
      particle.display();
    }

    //removes particles that are too high
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].isFinished()) {
        particles.splice(i, 1);
      }
    }
  };
}

export default function BonfireSketch({ fireCount, play }: BonfireSketchProps) {
  const searchParams = useSearchParams();

  // Lê os parâmetros da URL
  const urlFireCount = searchParams?.get("fireCount");
  const urlPlay = searchParams?.get("play");

  // Prioriza valores da URL se existirem
  const fireCountValue = useMemo(
    () => (urlFireCount !== null ? Number(urlFireCount) : fireCount),
    [urlFireCount, fireCount]
  );

  const playValue =
    urlPlay !== null ? urlPlay === "true" || urlPlay === "1" : play;

  return (
    <NextReactP5Wrapper
      sketch={sketch}
      fireCount={fireCountValue}
      play={playValue}
    />
  );
}
