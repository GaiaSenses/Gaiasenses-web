"use client";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";
//@ts-ignore this is generating require calls, should look into that
import { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
import p5 from "p5";

export type PumpSketchProps = {
  play: boolean;
  temperature: number;
  windSpeed: number;
  windDeg: number;
};

function sketch(p5: P5CanvasInstance<SketchProps & PumpSketchProps>) {
  let S: number, W: number, H: number, s: number, w: number, h: number;
  let wt: number, wt2;
  let D: number, r: number, r2: number, D2: number;
  let touch_margin: number;
  let inc1: number, inc2: number, limit1: number, limit2: number;
  let color1: p5.Color, color2: p5.Color;
  let t = 0;
  let mX = 0;
  let mY = 0;

  p5.setup = (init = true) => {
    S = p5.min((W = p5.windowWidth), (H = p5.windowHeight));
    s = S / 2;
    w = W / 2;
    h = H / 2;
    wt = S * 0.004;
    if (init) {
      p5.createCanvas(W, H);
      p5.strokeWeight(wt);
      p5.noFill();
      p5.rectMode(p5.CENTER);
    } else {
      p5.resizeCanvas(W, H);
    }

    touch_margin = 0.1;
    p5.background(0);

    D = S * 0.375; // diâmetro do círculo base
    r = D / 2;
    r2 = r / 4; // círculo “tracking”
    D2 = D + 2 * r + 4 * r2; // diâmetro do círculo contêiner
    wt = s / 40;
    wt2 = wt / 2;
    p5.strokeWeight(wt);

    inc1 = p5.TAU / 500;
    inc2 = p5.TAU / 300;
    limit1 = p5.QUARTER_PI - inc1 * 5;
    limit2 = p5.QUARTER_PI - inc2 * 5;

    // cores iniciais só para ter algo antes do primeiro draw()
    color1 = p5.color(0, 100, 250, 150);
    color2 = p5.color(250, 100, 0, 150);

    t = 0;
    mX = 0;
    mY = 0;
    // frameRate(144)
  };

  function draw_roots(offset: number, rotation: number, col: p5.Color) {
    p5.push();
    p5.translate(offset, 0);
    p5.rotate(rotation);
    p5.stroke(col);

    for (let theta = 0; theta < limit1; theta += inc1) {
      const theta2 = theta * 5;
      const x = (r + r2) * p5.cos(theta) + r2 * p5.cos(theta2);
      const y = (r + r2) * p5.sin(theta) + r2 * p5.sin(theta2);
      p5.point(x, y);
      p5.point(x, -y);
      p5.point(-x, y);
      p5.point(-x, -y);
    }

    p5.rotate(p5.HALF_PI);

    for (let theta = 0; theta < limit2; theta += inc2) {
      const theta2 = theta * 3;
      const x = (r - r2) * p5.cos(theta) - r2 * p5.cos(-theta2);
      const y = (r - r2) * p5.sin(theta) - r2 * p5.sin(-theta2);
      p5.point(x, y);
      p5.point(x, -y);
      p5.point(-x, y);
      p5.point(-x, -y);
    }

    p5.pop();
  }

  let temperature = 24;
  let windSpeed = 0;
  let windDeg = 0;
  let tempNorm = p5.constrain((temperature - 0) / 40, 0, 1); // 0–40°C → 0–1
  let windNorm = p5.constrain(windSpeed / 20, 0, 1); // 0–20 → 0–1

  p5.draw = () => {
    // lê temperatura e vento

    tempNorm = p5.constrain((temperature - 0) / 40, 0, 1); // 0–40°C → 0–1
    windNorm = p5.constrain(windSpeed / 20, 0, 1); // 0–20 → 0–1

    const climate = {
      temperature: temperature,
      windSpeed: windSpeed,
      windDeg: windDeg,
      tempNorm,
      windNorm,
    };

    // --- interação com mouse (como no original) ---

    if (p5.mouseIsPressed) {
      mX = p5.constrain(
        p5.map(p5.mouseX / W, touch_margin, 1 - touch_margin, -1, 1),
        -1,
        1,
      );
    }

    let userFactor;
    if (mX < 0) {
      // arrastar à esquerda desacelera
      userFactor = p5.map(mX, -1, 0, 0.2, 1.0);
    } else {
      // arrastar à direita acelera
      userFactor = p5.map(p5.sq(mX), 0, 1, 1.0, 4.0);
    }

    // --- vento → velocidade base ---

    // windNorm: 0 (sem vento) → 1 (vento forte)
    // mapeia para uma faixa de velocidades base
    let baseSpeed = p5.map(climate.windNorm, 0, 1, 0.01, 0.8);

    // passo de tempo final combinando clima + usuário
    const dt = baseSpeed * userFactor * 0.02;
    t += dt;

    // --- fundo neutro ---

    p5.background(0, 10); // alpha baixo para deixar rastro

    p5.translate(w, h);

    // --- temperatura → paleta de cores ---

    // paleta fria e quente para cada rotor
    const cold1 = p5.color(0, 120, 255, 150); // azul
    const warm1 = p5.color(255, 200, 80, 150); // dourado

    const cold2 = p5.color(0, 80, 180, 150); // azul mais escuro
    const warm2 = p5.color(255, 60, 0, 150); // laranja/vermelho

    // interpolação de frio (0) a quente (1)
    color1 = p5.lerpColor(cold1, warm1, climate.tempNorm);
    color2 = p5.lerpColor(cold2, warm2, climate.tempNorm);

    p5.strokeWeight(wt);

    // --- direção do vento → fase dos rotores ---

    const windPhase = p5.radians(climate.windDeg) * 0.25;

    draw_roots(-r, -t + windPhase, color1);
    draw_roots(r, t + p5.HALF_PI + windPhase, color2);
  };

  p5.updateWithProps = (props: PumpSketchProps) => {
    temperature = props.temperature;
    windSpeed = props.windSpeed;
    windDeg = props.windDeg;

    tempNorm = p5.constrain((temperature - 0) / 40, 0, 1); // 0–40°C → 0–1
    windNorm = p5.constrain(windSpeed / 20, 0, 1); // 0–20 → 0–1
  };
}

export default function PumpSketch({
  temperature,
  windSpeed,
  windDeg,
  play,
}: PumpSketchProps) {
  return (
    <NextReactP5Wrapper
      temperature={temperature}
      windSpeed={windSpeed}
      windDeg={windDeg}
      play={play}
      sketch={sketch}
    ></NextReactP5Wrapper>
  );
}
