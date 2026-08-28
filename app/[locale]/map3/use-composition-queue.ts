import { useCallback } from "react";
import CompositionsInfo from "@/components/compositions/compositions-info";

// 1. CONFIG (dados de satélite passados pelo servidor)
export type ClimaData = {
  windSpeed: number;
  humidity: number;
  clouds: number;
  temperature: number;
  lightnings: number;
  fireSpots: number;
  rain: number;
};

// 5 macro-categorias (substitui as 8 categorias antigas)
type CompositionScores = {
  atmosphere: number; // Vento, Nuvens e Fenômenos Aéreos
  fulmen: number; // Raios e Tempestade Elétrica
  pyro: number; // Fogo, Queimadas e Calor Extremo
  hydros: number; // Chuva, Umidade e Temperatura
  entropy: number; // Localização (Lat/Long) e Abstrações (Estado Padrão) - piso fixo, nunca zera
};

export type CompositionDecisionTrace = {
  clima: ClimaData;
  scores: CompositionScores;
  ruleDeltas: Record<string, CompositionScores>;
  categoria: keyof CompositionScores;
  escolha: string;
};

export function getCompositionDecisionTrace(
  clima: ClimaData,
): CompositionDecisionTrace {
  const scores: CompositionScores = {
    atmosphere: 0,
    fulmen: 0,
    pyro: 0,
    hydros: 0,
    entropy: 25, // piso fixo — não é zerado por nenhuma regra
  };

  const regras = {
    // Raios (separado de fogo para não sobrescrever erroneamente uma animação pela outra)
    fulmen: () => {
      if (clima.lightnings > 0) scores.fulmen += 90;
    },
    // Fogo/Queimadas e Calor Extremo
    pyro: () => {
      if (clima.fireSpots > 0) scores.pyro += 100;
      if (clima.temperature > 35) scores.pyro += 40;
    },
    // Vento e Nuvens
    atmosphere: () => {
      scores.atmosphere += clima.windSpeed * 4;
      if (clima.clouds > 50) scores.atmosphere += 30;
    },
    // Chuva, Umidade e Temperatura
    hydros: () => {
      scores.hydros += clima.rain * 5;
      scores.hydros += clima.humidity * 0.5;
      scores.hydros += clima.temperature * 0.3;
    },
  };

  const ruleDeltas: Record<string, CompositionScores> = {};

  const applyRuleWithDelta = (ruleName: string, fn: () => void) => {
    const before = { ...scores };
    fn();
    const after = { ...scores };

    ruleDeltas[ruleName] = {
      atmosphere: after.atmosphere - before.atmosphere,
      fulmen: after.fulmen - before.fulmen,
      pyro: after.pyro - before.pyro,
      hydros: after.hydros - before.hydros,
      entropy: after.entropy - before.entropy,
    };
  };

  // Executa regras in a fixed order for predictable debugging output
  applyRuleWithDelta("fulmen", regras.fulmen);
  applyRuleWithDelta("pyro", regras.pyro);
  applyRuleWithDelta("atmosphere", regras.atmosphere);
  applyRuleWithDelta("hydros", regras.hydros);

  const composicoes: Record<string, string[]> = {
    // Fenômenos: Vento (windLines), Nuvens (cloudBubble), Clima (weatherTree),
    // Direção do vento (stormEye), Roots Blower / temperatura+vento (pump)
    atmosphere: [
      CompositionsInfo.windLines.name,
      CompositionsInfo.cloudBubble.name,
      CompositionsInfo.weatherTree.name,
      CompositionsInfo.stormEye.name,
      CompositionsInfo.pump.name,
    ],
    // Fenômenos: Raios (lightningTrees, lightningBolts, attractor, zigzag),
    // Tempestade (stormEye)
    fulmen: [
      CompositionsInfo.lightningTrees.name,
      CompositionsInfo.lightningBolts.name,
      CompositionsInfo.attractor.name,
      CompositionsInfo.zigzag.name,
      CompositionsInfo.stormEye.name,
    ],
    // Fenômenos: Fogo/Queimadas (bonfire, burningTrees)
    pyro: [
      CompositionsInfo.bonfire.name,
      CompositionsInfo.burningTrees.name,
    ],
    // Fenômenos: Chuva (lluvia, zigzag, curves, digitalOrganism, rectangles, nightRain),
    // Temperatura (colorFlower, mudflatScatter, generativeStrings, riverLines), Umidade (paintBrush)
    hydros: [
      CompositionsInfo.lluvia.name,
      CompositionsInfo.zigzag.name,
      CompositionsInfo.curves.name,
      CompositionsInfo.digitalOrganism.name,
      CompositionsInfo.rectangles.name,
      CompositionsInfo.nightRain.name,
      CompositionsInfo.colorFlower.name,
      CompositionsInfo.mudflatScatter.name,
      CompositionsInfo.generativeStrings.name,
      CompositionsInfo.riverLines.name,
      CompositionsInfo.paintBrush.name,
    ],
    // Fenômenos: Localização/Latitude/Longitude (chaosTree, airports)
    entropy: [CompositionsInfo.chaosTree.name, CompositionsInfo.airports.name],
  };

  const categoria = (Object.keys(scores) as (keyof typeof scores)[]).reduce(
    (a, b) => (scores[a] > scores[b] ? a : b),
  );
  const options = composicoes[categoria];
  const escolha = options[Math.floor(Math.random() * options.length)];

  return {
    clima,
    scores,
    ruleDeltas,
    categoria,
    escolha,
  };
}

export function getCompositionForClima(clima: ClimaData): [string, any] {
  const trace = getCompositionDecisionTrace(clima);

  // Find the composition info
  const compositionInfo =
    CompositionsInfo[trace.escolha as keyof typeof CompositionsInfo];
  if (!compositionInfo) {
    // Fallback to default
    const defaultComp = "attractor";
    console.warn(
      "[composition-logic] missing composition info, falling back",
      defaultComp,
    );
    return [defaultComp, CompositionsInfo[defaultComp]];
  }
  //checar no terminal:
  console.log("————————————————————————————————————————————————————");
  console.log("Scores:", trace.scores);
  console.log("Categoria escolhida:", trace.categoria);
  console.log("Composição escolhida:", trace.escolha);
  console.log("————————————————————————————————————————————————————");
  return [trace.escolha, compositionInfo];
}

export function useCompositionQueue(clima: ClimaData) {
  const getNextComposition = useCallback((): [string, any] => {
    return getCompositionForClima(clima);
  }, [clima]);

  return { getNextComposition };
}

/* Old implementation of getNextComposition for preservation:

import { useCallback, useState } from "react";
import { comps, shuffle } from "./map-constants";

export function useCompositionQueue() {
  const [shuffled, setShuffled] = useState<Generator<any>>(() =>
    shuffle([...comps]),
  );

  const getNextComposition = useCallback((): [string, any] => {
    let next = shuffled.next().value;
    if (next === undefined) {
      const newShuffle = shuffle([...comps]);
      next = newShuffle.next().value;
      setShuffled(newShuffle);
    }
    return next;
  }, [shuffled]);

  return { getNextComposition };
}

*/