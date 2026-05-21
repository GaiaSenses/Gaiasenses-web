"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import p5Types from "p5";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { usePd4Web } from "@/app/[locale]/map3/pd4web-context";

export type LightningBoltsSketchProps = {
  lightningCount: number;
  play: boolean;
  pd4web?: pd4web.Pd4Web | null;
};

function sketch(p5: P5CanvasInstance<SketchProps & LightningBoltsSketchProps>) {
  //inspired by https://openprocessing.org/sketch/639075
  //configured by Lucas Mielle
  let bolts: ChaoticLine[] = [];
  let boltTimer = 0;
  let lightningCount = 0;
  let boltInterval = 35 / lightningCount;

  let [width, height] = [p5.windowWidth, p5.windowHeight];

  let play = false;
  let pd4web: pd4web.Pd4Web | null = null;
  p5.setup = () => {
    p5.createCanvas(p5.windowWidth, p5.windowHeight);
    p5.pixelDensity(1);
    p5.frameRate(40);
    bolts = [];
    p5.background(0);
  };

  p5.updateWithProps = (props: any) => {
    const count = Number.isNaN(props.lightningCount)
      ? lightningCount
      : props.lightningCount;
    play = props.play;
    lightningCount = count;
    boltInterval = 35 / lightningCount;
    pd4web = props.pd4web;
  };

  p5.draw = () => {
    p5.noStroke();
    p5.fill(0, 24);
    p5.rect(0, 0, width, height);

    if (boltTimer >= boltInterval) {
      for (let i = 0; i < lightningCount; i++) {
        let a1 = p5.random(p5.TWO_PI);
        let a2 = p5.random(p5.TWO_PI);
        let r1 = 0;
        let r2 = 700;
        let p1 = p5.createVector(
          p5.int(r1 * p5.cos(a1)),
          p5.int(r1 * p5.sin(a1)),
        );
        p1.add(width / 2, height / 2);
        let p2 = p5.createVector(
          p5.int(r2 * p5.cos(a2)),
          p5.int(r2 * p5.sin(a2)),
        );
        p2.add(width / 2, height / 2);
        bolts.push(new ChaoticLine(p1, p2, 0.35, p5));
        pd4web?.sendBang("bolt");
      }
      boltTimer = 0;
    } else {
      boltTimer++;
    }

    p5.stroke(64, 64, 255, 32);
    p5.strokeWeight(16);
    for (let cl of bolts) {
      cl.add(p5);
    }

    p5.stroke(64, 64, 255, 32);
    p5.strokeWeight(8);
    for (let cl of bolts) {
      cl.add(p5);
    }

    p5.stroke(128, 128, 255, 32);
    p5.strokeWeight(4);
    for (let cl of bolts) {
      cl.add(p5);
    }

    p5.stroke(255, 255, 255, 255);
    p5.strokeWeight(2);
    for (let cl of bolts) {
      cl.add(p5);
    }

    bolts = [];
  };

  class ChaoticLine {
    ptlist: p5Types.Vector[];
    constructor(
      public p1: p5Types.Vector,
      public p2: p5Types.Vector,
      public chaos: number,
      private p5: p5Types,
    ) {
      this.ptlist = this.createPoints(p1, p2, chaos);
      this.ptlist.push(p2);
    }

    createPoints(p1: p5Types.Vector, p2: p5Types.Vector, chaos: number) {
      let _ptlist: p5Types.Vector[] = [];
      let dx = p1.x - p2.x;
      let dy = p1.y - p2.y;
      let mag = dx * dx + dy * dy;
      if (mag > 100) {
        let ch = (this.p5.randomGaussian() * chaos) / 2.0;
        let xm = (p1.x + p2.x) / 2 - dy * ch;
        let ym = (p1.y + p2.y) / 2 + dx * ch;
        let mid = this.p5.createVector(xm, ym);
        _ptlist.push(...this.createPoints(p1, mid, chaos));
        _ptlist.push(...this.createPoints(mid, p2, chaos));
        return _ptlist;
      } else {
        _ptlist.push(p1);
        return _ptlist;
      }
    }

    add(p5: p5Types) {
      for (let i = 0; i < this.ptlist.length - 1; i++) {
        let p1 = this.ptlist[i];
        let p2 = this.ptlist[i + 1];
        p5.line(p1.x, p1.y, p2.x, p2.y);
      }
    }
  }
}

export default function LightningBoltsSketch(
  initialProps: LightningBoltsSketchProps,
) {
  const searchParams = useSearchParams();

  // ler params e converter para número quando existirem
  const urlLightningCount = searchParams?.get("lightningCount");
  const urlPlay = searchParams?.get("play");

  const lightningCount = useMemo(
    () =>
      urlLightningCount !== null
        ? Number(urlLightningCount)
        : initialProps.lightningCount,
    [urlLightningCount, initialProps.lightningCount],
  );

  const play =
    urlPlay !== null
      ? urlPlay === "true" || urlPlay === "1"
      : initialProps.play;

  const { pd4web } = usePd4Web();
  // passa os valores numéricos ao wrapper p5 — NextReactP5Wrapper chamará updateWithProps internamente
  return (
    <NextReactP5Wrapper
      sketch={sketch}
      lightningCount={lightningCount}
      play={play}
      pd4web={pd4web}
    />
  );
}
