"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type ChaosTreeSketchProps = {
  lat: number;
  lon: number;
  play: boolean;
};

const biome = [
  [
    "https://i.postimg.cc/Fs3hS5Bh/ipe1.jpg", // default images for all biomes
    "https://i.postimg.cc/W3HvyKj3/ipe2.jpg",
    "https://i.postimg.cc/1ttSJSk2/ipe3.jpg",
    "https://i.postimg.cc/MHfSJDKY/ipe4.jpg",
  ],
  [
    "https://i.postimg.cc/Fs3hS5Bh/ipe1.jpg",
    "https://i.postimg.cc/W3HvyKj3/ipe2.jpg",
    "https://i.postimg.cc/1ttSJSk2/ipe3.jpg",
    "https://i.postimg.cc/MHfSJDKY/ipe4.jpg",
    "https://i.postimg.cc/QdQPmX9B/amazonia1.jpg", // amazonia
    "https://i.postimg.cc/76WQhhcR/amazonia2.jpg",
    "https://i.postimg.cc/HLTNPfX6/amazonia3.jpg",
    "https://i.postimg.cc/nLTW801p/amazonia4.jpg",
  ],
  [
    "https://i.postimg.cc/Fs3hS5Bh/ipe1.jpg",
    "https://i.postimg.cc/W3HvyKj3/ipe2.jpg",
    "https://i.postimg.cc/1ttSJSk2/ipe3.jpg",
    "https://i.postimg.cc/MHfSJDKY/ipe4.jpg",
    "https://i.postimg.cc/CMmddry3/mata-Atlantica1.jpg", // mata atlantica
    "https://i.postimg.cc/zG9F6X0F/mata-Atlantica2.jpg",
    "https://i.postimg.cc/1tK080Pv/mata-Atlantica3.jpg",
    "https://i.postimg.cc/yYGG6KLk/mata-Atlantica4.jpg",
  ],
  [
    "https://i.postimg.cc/Fs3hS5Bh/ipe1.jpg",
    "https://i.postimg.cc/W3HvyKj3/ipe2.jpg",
    "https://i.postimg.cc/1ttSJSk2/ipe3.jpg",
    "https://i.postimg.cc/MHfSJDKY/ipe4.jpg",
    "https://i.postimg.cc/BnG0C76v/cerrado1.jpg", // cerrado
    "https://i.postimg.cc/RhkzyXLX/cerrado2.jpg",
    "https://i.postimg.cc/tJZjBLWs/cerrado3.jpg",
    "https://i.postimg.cc/9XKVDQHZ/cerrado4.jpg",
  ],
  [
    "https://i.postimg.cc/Fs3hS5Bh/ipe1.jpg",
    "https://i.postimg.cc/W3HvyKj3/ipe2.jpg",
    "https://i.postimg.cc/1ttSJSk2/ipe3.jpg",
    "https://i.postimg.cc/MHfSJDKY/ipe4.jpg",
    "https://i.postimg.cc/0QqnW43V/caatinga1.jpg", // caatinga
    "https://i.postimg.cc/J0rqmkRJ/caatinga2.jpg",
    "https://i.postimg.cc/tTt5L5Gp/caatinga3.jpg",
    "https://i.postimg.cc/D0xczwzN/caatinga4.jpg",
  ],
  [
    "https://i.postimg.cc/Fs3hS5Bh/ipe1.jpg",
    "https://i.postimg.cc/W3HvyKj3/ipe2.jpg",
    "https://i.postimg.cc/1ttSJSk2/ipe3.jpg",
    "https://i.postimg.cc/MHfSJDKY/ipe4.jpg",
    "https://i.postimg.cc/pL5TZf7d/pampa1.jpg", // pampa
    "https://i.postimg.cc/5tMxSZLP/pampa2.jpg",
    "https://i.postimg.cc/Qd785X99/pampa3.jpg",
    "https://i.postimg.cc/CLXMzZ1p/pampa4.jpg",
  ],
  [
    "https://i.postimg.cc/Fs3hS5Bh/ipe1.jpg",
    "https://i.postimg.cc/W3HvyKj3/ipe2.jpg",
    "https://i.postimg.cc/1ttSJSk2/ipe3.jpg",
    "https://i.postimg.cc/MHfSJDKY/ipe4.jpg",
    "https://i.postimg.cc/fTQLWtgt/pantanal1.jpg", // pantanal
    "https://i.postimg.cc/y6ZxzXnC/pantanal2.jpg",
    "https://i.postimg.cc/X7KvrjT2/pantanal3.jpg",
    "https://i.postimg.cc/fynwbp5n/pantanal4.jpg",
  ],
];

function sketch(p5: P5CanvasInstance<SketchProps & ChaosTreeSketchProps>) {
  // creator: Pedro Trama
  let particles: Particle[] = [];
  let img: any | null = null;
  let [lat, lon] = [0, 0];
  let play = false;

  let [width, height] = [p5.windowWidth, p5.windowHeight];
  let canvas: any | null = null;

  class Particle {
    pos: any;
    tgt: any;
    size: number;
    col: number[];

    constructor(x: number, y: number, size: number, img: any) {
      this.pos = p5.createVector(x, y);
      this.tgt = p5.createVector(p5.random(-1, 1) + x, p5.random(-1, 1) + y);
      this.size = size;
      this.col = img.get(x, y);
    }
  }

  const isInsideCanvas = (x: number, y: number) => {
    return img !== null && x < img.width && x > 0 && y < img.height && y > 0;
  };

  const distanceSquared = (x1: number, y1: number, x2: number, y2: number) => {
    return Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
  };

  const overlap = (
    x1: number,
    y1: number,
    diam1: number,
    x2: number,
    y2: number,
    diam2: number
  ) => {
    return (
      distanceSquared(x1, y1, x2, y2) < Math.pow(diam2 / 2 + diam1 / 2 - 2, 2)
    );
  };

  const getBiome = (lat: number, lon: number) => {
    const isAmazonia = (lat: number, lon: number) =>
      Math.round(lat) <= 5 &&
      Math.round(lat) >= -15 &&
      Math.round(lon) <= -45 &&
      Math.round(lon) >= -75;

    const isMataAtlantica = (lat: number, lon: number) =>
      Math.round(lat) <= -5 &&
      Math.round(lat) >= -30 &&
      Math.round(lon) <= -35 &&
      Math.round(lon) >= -55;

    const isCerrado = (lat: number, lon: number) =>
      Math.round(lat) <= -3 &&
      Math.round(lat) >= -24 &&
      Math.round(lon) <= -43 &&
      Math.round(lon) >= -60;

    const isCaatinga = (lat: number, lon: number) =>
      Math.round(lat) <= -2 &&
      Math.round(lat) >= -18 &&
      Math.round(lon) <= -35 &&
      Math.round(lon) >= -43;

    const isPampa = (lat: number, lon: number) =>
      Math.round(lat) <= -29 &&
      Math.round(lat) >= -35 &&
      Math.round(lon) <= -50 &&
      Math.round(lon) >= -55;

    const isPantanal = (lat: number, lon: number) =>
      Math.round(lat) <= -17 &&
      Math.round(lat) >= -22 &&
      Math.round(lon) <= -55 &&
      Math.round(lon) >= -58;

    if (isAmazonia(lat, lon)) {
      return 1;
    }
    if (isMataAtlantica(lat, lon)) {
      return 2;
    }
    if (isCerrado(lat, lon)) {
      return 3;
    }
    if (isCaatinga(lat, lon)) {
      return 4;
    }
    if (isPampa(lat, lon)) {
      return 5;
    }
    if (isPantanal(lat, lon)) {
      return 6;
    }
    return 0;
  };

  const initialize = () => {
    particles = [];
    let index = getBiome(lat, lon);
    let nestedBiome = biome[index];
    let randomImg = Math.floor(Math.random() * nestedBiome.length);
    p5.loadImage(nestedBiome[randomImg], (image: any) => {
      img = image;
      img.resize(width, height);
      p5.image(img, 0, 0);
      p5.frameRate(20);

      for (let i = 1; i > 0; i -= 0.0001) {
        const x = p5.random(img.width);
        const y = p5.random(img.height);
        const size = 40 * Math.pow(p5.random(i), 2) + 8;

        if (
          !particles.some((p) => overlap(x, y, size, p.pos.x, p.pos.y, p.size))
        ) {
          particles.push(new Particle(x, y, size, img));
        }
      }
      p5.noStroke();
    });
  };

  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(width, height, p5.P2D);
  };

  p5.updateWithProps = (props: any) => {
    play = props.play;
    if (props.lat !== lat || props.lon !== lon) {
      lat = props.lat;
      lon = props.lon;
      initialize();
    }

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    if (img && isInsideCanvas(p5.mouseX, p5.mouseY)) {
      p5.image(img, 0, 0);

      for (const particle of particles) {
        const t =
          1 -
          5e-4 *
            (Math.pow(particle.pos.x - p5.mouseX, 2) +
              Math.pow(particle.pos.y - p5.mouseY, 2));
        const p = [
          (1 - t) * particle.pos.x + particle.tgt.x * t,
          (1 - t) * particle.pos.y + particle.tgt.y * t,
        ];

        p5.fill(particle.col);
        p5.circle(p[0], p[1], particle.size);
      }
    }
  };
}

export default function ChaosTreeSketch(initialProps: ChaosTreeSketchProps) {
  const searchParams = useSearchParams();

  // ler params e converter para número quando existirem
  const urlLat = searchParams?.get("lat");
  const urlLon = searchParams?.get("lon");
  const urlPlay = searchParams?.get("play");

  const lat = useMemo(
    () => (urlLat !== null ? Number(urlLat) : initialProps.lat),
    [urlLat, initialProps.lat]
  );

  const lon = useMemo(
    () => (urlLon !== null ? Number(urlLon) : initialProps.lon),
    [urlLon, initialProps.lon]
  );

  const play =
    urlPlay !== null
      ? urlPlay === "true" || urlPlay === "1"
      : initialProps.play;

  // passa os valores numéricos ao wrapper p5 — NextReactP5Wrapper chamará updateWithProps internamente
  return <NextReactP5Wrapper sketch={sketch} lat={lat} lon={lon} play={play} />;
}
