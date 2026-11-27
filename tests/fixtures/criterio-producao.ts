/**
 * Oráculo: cópia congelada de `getCompositionDecisionTrace` da produção, commit 894a0ac
 * (app/[locale]/map3/use-composition-queue.ts). Idêntica, exceto que
 * `CompositionsInfo.x.name` virou a string literal (o nome é a chave) e o import de
 * CompositionsInfo saiu. Não importar do código de produção.
 * Extraído em 2026-11-26. NÃO EDITAR: oráculo.
 */

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
  atmosphere: number;
  fulmen: number;
  pyro: number;
  hydros: number;
  entropy: number;
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
      "windLines",
      "cloudBubble",
      "weatherTree",
      "stormEye",
      "pump",
    ],
    // Fenômenos: Raios (lightningTrees, lightningBolts, attractor, zigzag),
    // Tempestade (stormEye)
    fulmen: [
      "lightningTrees",
      "lightningBolts",
      "attractor",
      "zigzag",
      "stormEye",
    ],
    // Fenômenos: Fogo/Queimadas (bonfire, burningTrees)
    pyro: [
      "bonfire",
      "burningTrees",
    ],
    // Fenômenos: Chuva (lluvia, zigzag, curves, digitalOrganism, rectangles, nightRain),
    // Temperatura (colorFlower, mudflatScatter, generativeStrings, riverLines), Umidade (paintBrush)
    hydros: [
      "lluvia",
      "zigzag",
      "curves",
      "digitalOrganism",
      "rectangles",
      "nightRain",
      "colorFlower",
      "mudflatScatter",
      "generativeStrings",
      "riverLines",
      "paintBrush",
    ],
    // Fenômenos: Localização/Latitude/Longitude (chaosTree, airports)
    entropy: ["chaosTree", "airports"],
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
