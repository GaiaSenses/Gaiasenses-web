import { useCallback } from "react";
import CompositionsInfo from "@/components/compositions/compositions-info";
import { CANDIDATAS, pontuarAtual } from "@/lib/criterios/criterio-atual";

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

/**
 * Fachada: a pontuação vive em `lib/criterios/criterio-atual.ts` (uma só implementação,
 * provada igual à produção em `tests/criterio-atual.test.ts`). Aqui só se sorteia a obra.
 */
export function getCompositionDecisionTrace(
  clima: ClimaData,
  sortear: () => number = Math.random,
): CompositionDecisionTrace {
  const { scores, ruleDeltas, categoria } = pontuarAtual(clima);
  const options = CANDIDATAS[categoria];
  const escolha = options[Math.floor(sortear() * options.length)];

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