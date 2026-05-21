"use client";
import { useEffect, useRef, useState } from "react";
import p5Types from "p5";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

//This wrapper was found in https://aleksati.net/posts/how-to-use-p5js-with-nextjs-in-2024
// can go in "./types/global.d.ts"

export type GenerativeStringsSketchProps = {
  temp: number;
  play: boolean;
};

type P5jsContainerRef = HTMLDivElement;
type P5jsSketch = (
  p: p5Types,
  parentRef: P5jsContainerRef,
  temp: number
) => void;
type P5jsContainer = ({
  sketch,
  props,
}: {
  sketch: P5jsSketch;
  [key: string]: any;
}) => React.JSX.Element;

let osc, envelope, noise: any;
let pan = 0;
let notes = [
  { midi: 55 },
  { midi: 58 },
  { midi: 62 },
  { midi: 63 },
  { midi: 67 },
  { midi: 70 },
  { midi: 72 },
  { midi: 39 },
  { midi: 43 },
  { midi: 46 },
  { midi: 55 },
  { midi: 74 },
  { midi: 79 },
];

let notes2 = [
  { midi: 39 },
  { midi: 43 },
  { midi: 46 },
  { midi: 55 },
  { midi: 58 },
  { midi: 62 },
  { midi: 63 },
  { midi: 67 },
  { midi: 70 },
  { midi: 72 },
  { midi: 74 },
  { midi: 79 },
];

const sketch: P5jsSketch = (p, parentRef, temp) => {
  const p5 = p;

  let [w, h] = [p5.windowWidth, p5.windowHeight];
  let play = true;

  let width = 0;
  let height = 0;

  let strings: PlayString[] = [];
  let balls: Ball[] = [];

  p5.setup = () => {
    if (!play) p5.noLoop();
    p5.pixelDensity(1);
    p5.background(100);
    p5.createCanvas(w, h).parent(parentRef);
    width = p5.width;
    height = p5.height;

    // osc.start();
    for (var i = 0; i < notes.length; i++) {
      let span = (width * 0.9) / notes.length;
      let x = i * span + width * 0.05;
      strings.push(
        new PlayString(
          p5.createVector(x + 10, height / 2),
          p5.createVector(x - 10 + span, height / 2),
          notes[i].midi
        )
      );
    }

    for (var i = 0; i < 2 * temp; i++) {
      balls.push(
        new Ball({
          p: p5.createVector(p5.random(width), p5.random(height)),
          // v: p5.Vector.p5.random2D().mult(10)
          //original
          //v: p5.createVector(p5.random(-8, 8), p5.random(-8, 8)),
          //a: p5.createVector(p5.random(-0.5, 0.5), p5.random(-0.5, 0.5)),
          v: p5.createVector(
            p5.random(-8 * (temp / 10), 8 * (temp / 10)),
            p5.random(-8 * (temp / 10), 8 * (temp / 10))
          ),
          a: p5.createVector(
            p5.random(-0.5 * (temp / 100), 0.5 * (temp / 100)),
            p5.random(-0.5 * (temp / 100), 0.5 * (temp / 100))
          ),
        })
      );
    }
  };

  class PlayString {
    p1: any;
    p2: any;
    midi: any;
    trTime: number;
    useFreq: number;
    envelope: any;
    osc: any;
    panY: any;
    constructor(p1: any, p2: any, midi: any) {
      this.p1 = p1;
      this.p2 = p2;
      this.midi = midi;
      this.trTime = 0;
      this.useFreq = 0;

      //@ts-ignore
      this.envelope = new p5.constructor.Envelope();
      this.envelope.setADSR(
        p5.random(15, 40) / 1000,
        p5.random(10, 50) / 100,
        0.02,
        this.midi == -1 ? 0.5 : 0.2 + 100 / this.midi
      );
      this.envelope.setRange(0.2, 0);

      if (this.midi != -1) {
        if (p5.random() < 0.5) {
          //@ts-ignore
          this.osc = new p5.constructor.SinOsc();
        } else {
          //@ts-ignore
          this.osc = new p5.constructor.TriOsc();
        }
        //@ts-ignore not sure why this has changed
        this.osc.freq(p5.midiToFreq(this.midi + pan));
        //@ts-ignore not sure why this has changed
        this.useFreq = p5.midiToFreq(this.midi + pan);
      } else {
        //@ts-ignore
        this.osc = new p5.constructor.Noise();

        this.envelope.setADSR(1, 0.1, 0.05, 0.02);
      }
      this.osc.start();

      this.envelope.play(this.osc, 0, 0.2);
    }

    update() {
      this.trTime++;
      if (p5.random() < 0.05 && this.trTime > 5) {
        //@ts-ignore not sure why this has changed
        this.osc.freq(p5.midiToFreq(this.midi + pan));
        //@ts-ignore not sure why this has changed
        this.useFreq = p5.midiToFreq(this.midi + pan);
      }

      // this.p1.x+=sin(p5.frameCount/50)
      // this.p1.y+=cos(p5.frameCount/50)
    }
    draw() {
      p5.push();
      p5.colorMode(p5.HSB);

      if (this.trTime < 20) {
        p5.strokeWeight(50 * this.trTime);
        p5.stroke(
          this.useFreq / 5,
          255 / p5.sqrt(this.trTime),
          20 * (15 - this.trTime)
        );

        p5.strokeWeight(5 + 15 / p5.sqrt(this.trTime));
        p5.line(this.p1.x, this.p1.y, this.p2.x, this.p2.y);
      }

      let panY = 0;
      if (this.trTime < 20) {
        this.panY = p5.sin(this.trTime) * 10;
      }

      p5.stroke(this.useFreq / 5, 255 / p5.sqrt(this.trTime), 100);
      p5.strokeWeight(5 + 15 / p5.sqrt(this.trTime));
      p5.line(this.p1.x, this.p1.y, this.p2.x, this.p2.y);

      p5.colorMode(p5.RGB);
      p5.fill(255, 255, 255, 50);
      p5.noStroke();
      p5.rect(this.p1.x, this.p1.y + 10, this.trTime / 2, 1);

      p5.pop();
    }
    play() {
      var midiValue = this.midi;
      //@ts-ignore not sure why this has changed
      var freqValue = p5.midiToFreq(midiValue);
      this.trTime = 0;

      this.envelope.play(this.osc, 0, 0.2);
    }
    collide(p: any, obj: any) {
      if (this.trTime > 10) {
        let p1 = this.p1,
          p2 = this.p2;

        if (obj) {
          this.envelope.setRange(obj.mass / 140, 0);
        }
        return p.dist(p1) + p.dist(p2) <= p1.dist(p2) + 0.5;
      }
    }
  }
  class Ball {
    v: any;
    p: any;
    a: any;
    mass!: number;
    live!: boolean;
    constructor(args: any) {
      let def = {
        p: p5.createVector(0, 0),
        v: p5.createVector(0, 0),
        a: p5.createVector(0, 0),
        mass: p5.random(1, 80 + temp),
        live: true,
      };
      Object.assign(def, args);
      Object.assign(this, def);
    }
    update() {
      this.p = this.p.add(this.v);
      this.v = this.v.add(this.a);
      let angle =
        p5.frameCount / 10 +
        this.a.x * 10 +
        p5.noise(p5.frameCount / 100) * p5.PI * 2;
      this.p = this.p.add(
        p5
          .createVector(p5.cos(angle), p5.sin(angle))
          .mult(this.a.y * 1000)
          .mult(0.01)
      );

      if (this.p.x < 0) this.v.x = p5.abs(this.v.x);
      if (this.p.x > width) this.v.x = -p5.abs(this.v.x);
      if (this.p.y < 0) this.v.y = p5.abs(this.v.y);
      if (this.p.y > height) this.v.y = -p5.abs(this.v.y);
    }
    draw() {
      // p5.fill(255)
      p5.push();
      // p5.noFill()
      p5.noStroke();
      p5.fill(255, 255, 255, this.mass * 3);
      p5.ellipse(this.p.x, this.p.y, this.r, this.r);
      p5.pop();
    }
    get r() {
      return p5.sqrt(this.mass / 3) + 1;
    }
  }

  p5.draw = () => {
    p5.push();
    p5.stroke(255, 255, 255, 40);
    for (var i = 0; i < width; i += 10) {
      p5.stroke(255, 255, 255, i % 50 == 0 ? 70 : 20);
      p5.line(i, 0, i, height);
    }
    for (var o = 0; o < height; o += 10) {
      p5.stroke(255, 255, 255, o % 50 == 0 ? 70 : 20);
      p5.line(0, o, width, o);
    }
    p5.fill(255);
    p5.rect(width / 2, height - 20, pan * 10, 5);

    p5.pop();

    // p5.ellipse(mouseX, mouseY, 20, 20);
    p5.frameRate(30);
    if (p5.frameCount % 200 == 0) {
      pan = p5.random([0, -2, -4, 5, 6, 8]);
    }
    p5.background(0, 0, 0, 180);
    p5.push();
    p5.noStroke();
    p5.fill(255, 255, 255, 200);
    p5.textSize(14);
    p5.textSize(10);
    p5.fill(255, 255, 255, 100);

    p5.pop();

    p5.noFill();
    p5.stroke(255);
    strings.forEach((s) => s.update());
    strings.forEach((s) => s.draw());
    balls.forEach((b) => b.update());
    balls.forEach((b) => b.draw());

    strings.forEach((s, sid) => {
      // 		s.p1.y+=sin(p5.frameCount/20+sid)*noise(sid)*5
      // 		s.p2.y+=sin(p5.frameCount/20+sid)*noise(sid)*5

      balls.forEach((b) => {
        if (s.collide(b.p, b)) {
          s.play();
          b.mass /= 3;
          b.mass -= 5;
          // b.live=false
        }
      });
    });
    balls = balls.filter((b) => b.live && b.mass > 0);

    if (p5.mouseIsPressed) {
      p5.push();
      p5.strokeWeight(1);
      p5.noFill();
      p5.stroke(255, 255, 255, 150);
      let r = p5.sin(p5.frameCount / 10) * 5 + 20;
      p5.ellipse(p5.mouseX, p5.mouseY, r, r);
      p5.pop();
      balls.push(
        new Ball({
          p: p5.createVector(p5.mouseX, p5.mouseY),
          v: p5.createVector(p5.random(-5, 5), p5.random(-5, 5)),
          a: p5.createVector(p5.random(-0.5, 0.5), p5.random(-0.5, 0.5)),
        })
      );
    }
    // 	if (p5.frameCount % 50 ==0 || p5.frameCount==1){
    // 		var midiValue = 48;
    //     var freqValue = p5.midiToFreq(midiValue);
    //     osc.freq(freqValue);

    //     envelope.play(osc, 0, 0.1);
    // 	}
    if (p5.frameCount % 15 == 0) {
      balls.push(
        new Ball({
          p: p5.createVector(p5.random(width), p5.random(height)),
          // v: p5.Vector.p5.random2D().mult(10)
          v: p5.createVector(p5.random(-5, 5), p5.random(-5, 5)),
          a: p5.createVector(p5.random(-0.5, 0.5), p5.random(-0.5, 0.5)),
        })
      );
    }
  };
};

// components/P5jsContainer.tsx
export const P5jsContainer: P5jsContainer = ({ sketch, temp }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // on mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    let p5instance: p5Types;
    const initP5 = async () => {
      try {
        // import the p5 and p5-sounds client-side
        const p5 = (await import("p5")).default;
        if (!(window as any).p5) {
          (window as any).p5 = p5;
        }
        //@ts-ignore not sure why this has changed
        await import("p5/lib/addons/p5.sound");
        new p5((p) => {
          //@ts-ignore
          sketch(p, parentRef.current, temp);
          p5instance = p;
        });
      } catch (error) {
        console.log(error);
      }
    };
    if (typeof window !== "undefined") {
      initP5();
    }

    return () => {
      if (p5instance) {
        p5instance.remove();
      }
    };
  }, [isMounted, sketch, temp]);

  return <div ref={parentRef} className="absolute top-0 left-0"></div>;
};

export default function GenerativeStringsSketch(
  initialProps: GenerativeStringsSketchProps
) {
  const searchParams = useSearchParams();

  // ler params e converter para número quando existirem
  const urlTemp = searchParams?.get("temp");
  const urlPlay = searchParams?.get("play");

  const temp = useMemo(
    () => (urlTemp !== null ? Number(urlTemp) : initialProps.temp),
    [urlTemp, initialProps.temp]
  );

  const play =
    urlPlay !== null
      ? urlPlay === "true" || urlPlay === "1"
      : initialProps.play;

  // passa os valores numéricos ao wrapper p5 — NextReactP5Wrapper chamará updateWithProps internamente
  return <P5jsContainer sketch={sketch} temp={Math.abs(temp)}></P5jsContainer>;
}

/*export default function NameSketch(initialProps: NameSketchProps) {
  const searchParams = useSearchParams();

  // ler params e converter para número quando existirem
  const urlTemp = searchParams?.get("Temp");
  const urlDado2 = searchParams?.get("dado2");
  const urlPlay = searchParams?.get("play");

  const Temp = useMemo(
    () => (urlTemp !== null ? Number(urlTemp) : initialProps.Temp),
    [urlTemp, initialProps.Temp]
  );

  const dado2 = useMemo(
    () => (urlDado2 !== null ? Number(urlDado2) : initialProps.dado2),
    [urlDado2, initialProps.dado2]
  );

  const play =
    urlPlay !== null ? (urlPlay === "true" || urlPlay === "1") : initialProps.play;

  // passa os valores numéricos ao wrapper p5 — NextReactP5Wrapper chamará updateWithProps internamente
  return (
    <P5jsContainer sketch={sketch} temp={Math.abs(props.temp)}></P5jsContainer>
  );
}*/
