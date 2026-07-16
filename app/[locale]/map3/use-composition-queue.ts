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

type CompositionScores = {
  void: number;
  aeolus: number;
  spark: number;
  flow: number;
  ethereal: number;
  infernus: number;
  thermal: number;
  downpour: number;
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
    void: 25,
    aeolus: 0,
    spark: 0,
    flow: 0,
    ethereal: 0,
    infernus: 0,
    thermal: 0,
    downpour: 0,
  };

  const regras = {
    //raios
    spark: () => {
      if (clima.lightnings > 0) {
        scores.spark += 85;
        scores.void = 0;
      }
    },
    //vento
    aeolus: () => {
      scores.aeolus += clima.windSpeed * 2.5;
      if (clima.windSpeed > 8) scores.void = 0;
    },
    //humidade
    flow: () => {
      scores.flow += clima.humidity * 0.5;
      if (clima.humidity > 80) scores.void = 0;
    },
    //visibilidade
    ethereal: () => {
      if (clima.clouds > 70) {
        scores.ethereal += 45;
      }
    },
    //chuva
    downpour: () => {
    if (clima.rain > 0) {
      scores.downpour += 75;
      }
    },
    //temperatura
    thermal: () => {
      if (clima.fireSpots > 0) {
        scores.infernus += 100;
        scores.void = 0;
        return;
      }

      if (clima.temperature > 32) {
        scores.infernus += 30;
        scores.thermal += clima.temperature * 0.5;
      } else {
        scores.thermal += clima.temperature * 0.8;
      }
    },
  };

  const ruleDeltas: Record<string, CompositionScores> = {};

  const applyRuleWithDelta = (ruleName: string, fn: () => void) => {
    const before = { ...scores };
    fn();
    const after = { ...scores };

    ruleDeltas[ruleName] = {
      void: after.void - before.void,
      aeolus: after.aeolus - before.aeolus,
      spark: after.spark - before.spark,
      flow: after.flow - before.flow,
      ethereal: after.ethereal - before.ethereal,
      infernus: after.infernus - before.infernus,
      thermal: after.thermal - before.thermal,
      downpour: after.downpour - before.downpour,
    };
  };

  // Executa regras in a fixed order for predictable debugging output
  applyRuleWithDelta("spark", regras.spark);
  applyRuleWithDelta("aeolus", regras.aeolus);
  applyRuleWithDelta("flow", regras.flow);
  applyRuleWithDelta("ethereal", regras.ethereal);
  applyRuleWithDelta("thermal", regras.thermal);
  applyRuleWithDelta("downpour", regras.downpour);
  const composicoes: Record<string, string[]> = {
    void: [CompositionsInfo.zigzag.name, CompositionsInfo.attractor.name],
    aeolus: [
      CompositionsInfo.windLines.name,
      CompositionsInfo.stormEye.name,
      CompositionsInfo.riverLines.name,
    ],
    spark: [
      CompositionsInfo.lightningBolts.name,
      CompositionsInfo.attractor.name,
      CompositionsInfo.zigzag.name,
      CompositionsInfo.stormEye.name,
      CompositionsInfo.lightningTrees.name,
    ],
    flow: [
      CompositionsInfo.lluvia.name,
      CompositionsInfo.digitalOrganism.name,
      CompositionsInfo.riverLines.name,
      CompositionsInfo.zigzag.name,
      CompositionsInfo.curves.name,
      CompositionsInfo.paintBrush.name,
    ],
    ethereal: [CompositionsInfo.cloudBubble.name],
    infernus: [
      CompositionsInfo.burningTrees.name,
      CompositionsInfo.bonfire.name,
    ],
    thermal: [
      CompositionsInfo.colorFlower.name,
      CompositionsInfo.generativeStrings.name,
      CompositionsInfo.curves.name,
      CompositionsInfo.riverLines.name,
      CompositionsInfo.mudflatScatter.name,
    ],
    downpour: [
      CompositionsInfo.nightRain.name,
      CompositionsInfo.rectangles.name,
    ],
  };

  const categoria = (Object.keys(scores) as (keyof typeof scores)[]).reduce(
    (a, b) => (scores[a] > scores[b] ? a : b),
  );
  const options = composicoes[categoria];
  const escolha =
    composicoes[categoria][
      Math.floor(Math.random() * composicoes[categoria].length)
    ];

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

  //checar no terminal:
  console.log("————————————————————————————————————————————————————");
  console.log("Scores:", trace.scores);
  console.log("Categoria escolhida:", trace.categoria);
  console.log("Composição escolhida:", trace.escolha);
  console.log("————————————————————————————————————————————————————");

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
