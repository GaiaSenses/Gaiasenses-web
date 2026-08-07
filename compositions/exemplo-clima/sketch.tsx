"use client";

//@ts-ignore este import gera chamadas require; mesma ressalva das outras animações
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { useMemo } from "react";

/**
 * Animação declarada de referência.
 *
 * Ela não é bonita nem pretende ser — existe para mostrar a forma que um sketch
 * precisa ter, e para o CI ter uma animação declarada que ele possa construir e
 * verificar de verdade a cada PR.
 *
 * As props chegam com os nomes que o `composition.json` pediu em `attributes`.
 * Nenhum wrapper foi escrito para esta animação: o `composition-runtime` busca
 * os dados, escolhe o áudio e monta isto aqui.
 */
export type ExemploClimaProps = {
  play: boolean;
  temperature: number;
  rain: number;
};

function sketch(p5: P5CanvasInstance<SketchProps & ExemploClimaProps>) {
  let temperature = 0;
  let rain = 0;
  let play = false;
  let t = 0;

  p5.updateWithProps = (props) => {
    if (typeof props.temperature === "number") temperature = props.temperature;
    if (typeof props.rain === "number") rain = props.rain;
    if (typeof props.play === "boolean") {
      play = props.play;
      play ? p5.loop() : p5.noLoop();
    }
  };

  p5.setup = () => {
    p5.createCanvas(p5.windowWidth, p5.windowHeight);
    p5.colorMode(p5.HSB, 360, 100, 100, 100);
    p5.noStroke();
    if (!play) p5.noLoop();
  };

  p5.windowResized = () => {
    p5.resizeCanvas(p5.windowWidth, p5.windowHeight);
  };

  p5.draw = () => {
    // -60..55 °C vira o arco de azul a vermelho. `constrain` protege de um
    // valor fora de faixa, que um dado real ocasionalmente traz.
    const matiz = p5.map(p5.constrain(temperature, -60, 55), -60, 55, 220, 0);
    // Chuva vira tamanho: 0 mm/h dá um ponto, 20 já enche a tela.
    const raio = p5.map(p5.constrain(rain, 0, 20), 0, 20, 8, 90);

    p5.background(matiz, 40, 12, 100);
    t += 0.01;

    for (let i = 0; i < 24; i++) {
      const angulo = (i / 24) * p5.TWO_PI + t;
      const x = p5.width / 2 + Math.cos(angulo) * (p5.width / 4);
      const y = p5.height / 2 + Math.sin(angulo * 1.3) * (p5.height / 4);
      p5.fill(matiz, 70, 90, 45);
      p5.circle(x, y, raio);
    }
  };
}

export default function ExemploClimaSketch(props: ExemploClimaProps) {
  const memo = useMemo(() => sketch, []);
  return <NextReactP5Wrapper sketch={memo} {...props} />;
}
