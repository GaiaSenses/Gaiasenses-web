import CompositionsInfo from "@/components/compositions/compositions-info";

export type MapLocation = {
  name: string;
  coords: [number, number];
  composition: string;
};

export const locations: MapLocation[] = [
  {
    name: "CTI",
    coords: [-47.12870085542251, -22.851741644263786],
    composition: "zigzag",
  },
  {
    name: "Belfast",
    coords: [-5.925948120326226, 54.59624433531145],
    composition: "stormEye",
  },
  {
    name: "São Paulo",
    coords: [-46.62283272732059, -23.554978262429717],
    composition: "burningTrees",
  },
  {
    name: "Tokyo",
    coords: [139.9118266746732, 35.69322960644536],
    composition: "digitalOrganism",
  },
  {
    name: "Paris",
    coords: [2.349091224739889, 48.85701848772013],
    composition: "mudflatScatter",
  },
  {
    name: "Rio de Janeiro",
    coords: [-43.28570708635095, -22.90166071685915],
    composition: "attractor",
  },
  {
    name: "Brasília",
    coords: [-47.3406054804507, -15.795060704219555],
    composition: "riverLines",
  },
];

const ENABLED_COMPOSITIONS = new Set([
  "lluvia",
  "zigzag",
  "colorFlower",
  "stormEye",
  "curves",
  "chaosTree",
  "cloudBubble",
  "bonfire",
  "digitalOrganism",
  "rectangles",
  "lightningTrees",
  "weatherTree",
  "mudflatScatter",
  "paintBrush",
  "generativeStrings",
  "nightRain",
  "windLines",
  "lightningBolts",
  "burningTrees",
  "airports",
  "riverLines",
  "attractor",
  "pump",
]);

export const comps = Object.entries(CompositionsInfo).filter(([key]) =>
  ENABLED_COMPOSITIONS.has(key),
);

export const enabledCompositionKeys = comps.map(([key]) => key);

export function* shuffle(array: any[]): Generator<any> {
  let i = array.length;
  while (i--) {
    const rand = Math.random() * (i + 1);
    yield array.splice(Math.floor(rand), 1)[0];
  }
}
