"use client";

import Discrete from "./discrete";
import SatSketch from "./sat-sketch";

/**
 * Airports é a única animação que não é um sketch p5.
 *
 * Ela é uma imagem de satélite do lugar para onde o globo aponta, com uma
 * implementação em Tone.js do *Discrete Music* (Brian Eno, 1975) tocando por
 * cima. O som não passa pelo `CompositionControls` como o das outras: o
 * `Discrete` gera o áudio e traz o próprio botão de tocar.
 *
 * Por isso este arquivo existe. O runtime monta um componente só por animação,
 * e aqui são dois — então o "sketch" é a composição dos dois, e o manifesto
 * declara `audio: none` porque não há arquivo a tocar.
 *
 * `lat` e `lon` chegam como número, e o SatSketch monta uma URL com eles; a
 * conversão para texto acontece aqui, na fronteira, e não dentro dele.
 */
export type AirportsSketchProps = {
  lat: number;
  lon: number;
  play: boolean;
};

export default function AirportsSketch({ lat, lon, play }: AirportsSketchProps) {
  return (
    <>
      <SatSketch lat={String(lat)} lon={String(lon)} />
      <Discrete play={play} />
    </>
  );
}
