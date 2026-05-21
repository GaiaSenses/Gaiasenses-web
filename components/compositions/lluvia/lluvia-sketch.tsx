"use client";

import { usePd4Web } from "@/app/[locale]/map3/pd4web-context";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
import { useEffect } from "react";

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

const MAX_DROPS = 400;

function sketch(p5: P5CanvasInstance<LluviaSketchProps>) {
  let play = false;
  const drops: Raindrop[] = [];
  let canvas: any = null;
  // Idempotent listener registration state
  // allows only a single listener to be registered per pd4web instance
  let paintListenerMap = new WeakMap<pd4web.Pd4Web, boolean>();

  const spawnDrop = () => {
    drops.push({
      x: p5.random(p5.windowWidth),
      y: p5.random(p5.windowHeight),
      diameter: p5.random(18, 72),
      color: [p5.random(60, 255), p5.random(60, 255), p5.random(60, 255), 220],
    });

    while (drops.length > MAX_DROPS) {
      drops.shift();
    }

    p5.redraw();
  };

  p5.updateWithProps = (props: LluviaSketchProps) => {
    const nextPlay = Boolean(props.play);
    const pd = props.pd4web;

    // Attach listener only once per pd4web instance
    // This is needed becaue pd4web does not offer an off method to remove listeners,
    // so every time the sketch re-renders a new listener would be added,
    // causing multiple drops to be spawned per paint bang.
    if (nextPlay && pd && !paintListenerMap.get(pd)) {
      paintListenerMap.set(pd, true);
      console.log("Attaching paint listener to pd4web instance:", pd);
      pd.onBangReceived("paint", (name: string) => {
        spawnDrop();
      });
    }

    if (nextPlay === play) return;
    play = nextPlay;
  };

  p5.setup = () => {
    if (!canvas) {
      const c = p5.createCanvas(p5.windowWidth, p5.windowHeight);
      canvas = c;
    }

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
}

export function LluviaSketch({ play }: LluviaSketchProps) {
  const { pd4web } = usePd4Web();

  useEffect(() => {
    pd4web?.sendBang("start");
  }, [pd4web]);

  return <NextReactP5Wrapper sketch={sketch} play={play} pd4web={pd4web} />;
}

export default LluviaSketch;
