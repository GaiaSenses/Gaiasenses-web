"use client";

import { NextReactP5Wrapper } from "@p5-wrapper/next";
import type { Sketch, SketchProps } from "@p5-wrapper/react";
import { usePd4Web } from "./pd4web-context";

type LluviaSketchProps = SketchProps & {
  play: boolean;
  pd4web?: pd4web.Pd4Web | null;
};

type Raindrop = {
  x: number;
  y: number;
  diameter: number;
  color: [number, number, number, number];
};

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 320;
const MAX_DROPS = 180;

const sketch: Sketch<LluviaSketchProps> = (p5) => {
  let play = false;
  const drops: Raindrop[] = [];

  const spawnDrop = () => {
    drops.push({
      x: p5.random(CANVAS_WIDTH),
      y: p5.random(CANVAS_HEIGHT),
      diameter: p5.random(18, 72),
      color: [p5.random(60, 255), p5.random(60, 255), p5.random(60, 255), 220],
    });

    while (drops.length > MAX_DROPS) {
      drops.shift();
    }

    p5.redraw();
  };

  p5.updateWithProps = (props) => {
    const nextPlay = Boolean(props.play);

    if (nextPlay === play) {
      return;
    }

    play = nextPlay;
    if (play) {
      props.pd4web?.onBangReceived("paint", (name: string) => {
        console.log(name);
        spawnDrop();
      });
    }
  };

  p5.setup = () => {
    const canvas = p5.createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    canvas.style("display", "block");
    canvas.style("width", "100%");
    canvas.style("height", "auto");
    p5.noLoop();
    p5.background(245, 246, 249);
  };

  p5.draw = () => {
    p5.background(245, 246, 249);
    p5.noStroke();

    drops.forEach((drop) => {
      p5.fill(...drop.color);
      p5.circle(drop.x, drop.y, drop.diameter);
    });
  };

  p5.windowResized = () => {
    p5.redraw();
  };

  p5.remove = () => {};
};

export function LluviaSketch({ play }: LluviaSketchProps) {
  console.log("Rendering LluviaSketch with play =", play);
  const Pd4webContext = usePd4Web();
  console.log(Pd4webContext.activePatch);

  if (Pd4webContext.activePatch === "bubble1") {
    Pd4webContext.pd4web?.sendBang("start");
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/60 shadow-lg backdrop-blur dark:bg-black/20">
      <NextReactP5Wrapper
        key={"lluvia"}
        sketch={sketch}
        play={play}
        pd4web={Pd4webContext.pd4web}
      />
    </div>
  );
}

export default LluviaSketch;
