import ChaosTree from "./chaos-tree/chaos-tree";
import CloudBubble from "./cloud-bubble/cloud-bubble";
import ColorFlower from "./color-flower/color-flower";
import Curves from "./curves/curves";
import DigitalOrganism from "./digital-organism/digital-organism";
import Bonfire from "./bonfire/bonfire";
import GenerativeStrings from "./generative-strings/generative-strings";
import LightningTrees from "./lightning-trees/lightning-trees";
import Lluvia from "./lluvia/lluvia";
import MudflatScatter from "./mudflat-scatter/muflat-scatter";
import PaintBrush from "./paint-brush/paint-brush";
import Rectangles from "./rectangles/rectangles";
import StormEye from "./storm-eye/storm-eye";
import WeatherTree from "./weather-tree/weather-tree";
import Zigzag from "./zigzag/zigzag";
import NightRain from "./night-rain/night-rain";
import WindLines from "./wind-lines/wind-lines";
import LightningBolts from "./lightning-bolts/lightning-bolts";
import BurningTrees from "./burning-trees/burning-trees";
import Airports from "./airports/airports";
import RiverLines from "./river-lines/river-lines";
import Attractor from "./attractor/attractor";
import Pump from "./pump/pump";

export type AvailableCompositionNames =
  | "lluvia"
  | "zigzag"
  | "colorFlower"
  | "stormEye"
  | "curves"
  | "chaosTree"
  | "cloudBubble"
  | "digitalOrganism"
  | "paintBrush"
  | "rectangles"
  | "lightningTrees"
  | "weatherTree"
  | "mudflatScatter"
  | "generativeStrings"
  | "bonfire"
  | "nightRain"
  | "windLines"
  | "lightningBolts"
  | "burningTrees"
  | "airports"
  | "riverLines"
  | "attractor"
  | "pump";

export type AvailableCompositionComponents =
  | typeof Lluvia
  | typeof Zigzag
  | typeof Curves
  | typeof ChaosTree
  | typeof CloudBubble
  | typeof DigitalOrganism
  | typeof PaintBrush
  | typeof Rectangles
  | typeof LightningTrees
  | typeof WeatherTree
  | typeof GenerativeStrings
  | typeof Bonfire
  | typeof NightRain
  | typeof WindLines
  | typeof LightningBolts
  | typeof BurningTrees
  | typeof Airports
  | typeof RiverLines
  | typeof Attractor
  | typeof Pump;

export type CompositionInfo = {
  name: string;
  attributes: string[];
  Component: AvailableCompositionComponents;
  endpoints: string[];
  thumb: string;
  author?: string;
  openProcessingLink?: string;
  keepMapPatch?: boolean;
  patchId?: string;
};

export type CompositionsInfoType = {
  [K in AvailableCompositionNames]: CompositionInfo;
};

const CompositionsInfo: CompositionsInfoType = {
  lluvia: {
    name: "lluvia",
    attributes: ["rain"],
    Component: Lluvia,
    endpoints: ["rainfall"],
    thumb: "lluvia.png",
    openProcessingLink: "https://openprocessing.org/sketch/386391",
    author: "AK Stuxnet",
    patchId: "bubble1",
  },
  zigzag: {
    name: "zigzag",
    attributes: ["rain", "lightningCount"],
    Component: Zigzag,
    endpoints: ["rainfall", "lightning"],
    thumb: "zig-zag.png",
    openProcessingLink: "https://openprocessing.org/sketch/1643288",
    author: " garabatospr",
  },
  colorFlower: {
    name: "colorFlower",
    attributes: ["temperature"],
    Component: ColorFlower,
    endpoints: [""],
    thumb: "color-flower.png",
    openProcessingLink: "https://openprocessing.org/sketch/1929051",
    author: "Aaron Reuland (a_ soluble_fish",
  },
  stormEye: {
    name: "stormEye",
    attributes: ["temperature", "windSpeed", "windDeg"],
    Component: StormEye,
    endpoints: [""],
    thumb: "storm-eye.png",
    openProcessingLink: "https://openprocessing.org/sketch/1936782",
    author: "Mandelgen",
  },
  curves: {
    name: "curves",
    attributes: ["rain", "temperature"],
    Component: Curves,
    endpoints: ["rainfall"],
    thumb: "curves.png",
    openProcessingLink: "https://openprocessing.org/sketch/1176431",
    author: "Pedro Alexis Mendoza Llanos ",
    keepMapPatch: true,
  },
  chaosTree: {
    name: "chaosTree",
    attributes: ["lat", "lon"],
    Component: ChaosTree,
    endpoints: [""],
    thumb: "chaos-tree.png",
    author: "Pedro Trama",
  },
  cloudBubble: {
    name: "cloudBubble",
    attributes: ["clouds"],
    Component: CloudBubble,
    endpoints: ["rainfall"],
    thumb: "cloud-bubble.png",
    openProcessingLink: "https://openprocessing.org/sketch/1786759",
    author: "Naoki Tsutae",
    keepMapPatch: true,
  },
  digitalOrganism: {
    name: "digitalOrganism",
    attributes: ["rain"],
    Component: DigitalOrganism,
    endpoints: ["rainfall"],
    thumb: "digital-organism.png",
    openProcessingLink: "https://openprocessing.org/sketch/1864228",
    author: "Naoki Tsutae",
  },
  paintBrush: {
    name: "paintBrush",
    attributes: ["humidity"],
    Component: PaintBrush,
    endpoints: ["rainfall"],
    thumb: "paint-brush.png",
    openProcessingLink: "https://openprocessing.org/sketch/1645787",
    author: "Aaron Reuland (a_ soluble_fish)",
  },
  rectangles: {
    name: "rectangles",
    attributes: ["rain"],
    Component: Rectangles,
    endpoints: ["rainfall"],
    thumb: "rectangles.png",
    openProcessingLink: "https://openprocessing.org/sketch/1274144",
    author: " Desire Sanchez",
  },
  lightningTrees: {
    name: "lightningTrees",
    attributes: ["lightningCount"],
    Component: LightningTrees,
    endpoints: ["lightning"],
    thumb: "lightning-trees.png",
    openProcessingLink: "https://openprocessing.org/sketch/1203202",
    author: "Roni Kaufman",
  },
  weatherTree: {
    name: "weatherTree",
    attributes: [""],
    Component: WeatherTree,
    endpoints: [""],
    thumb: "weather-tree.png",
    openProcessingLink: "https://openprocessing.org/sketch/1780681",
    author: "Gazi",
  },
  mudflatScatter: {
    name: "mudflatScatter",
    attributes: ["temperature", "windDeg", "windSpeed"],
    Component: MudflatScatter,
    endpoints: [""],
    thumb: "weather-tree.png",
    openProcessingLink: "https://openprocessing.org/sketch/1982410",
    author: "Aaron Reuland (a_ soluble_fish) ",
  },
  generativeStrings: {
    name: "generativeStrings",
    attributes: ["temperature", "humidity"],
    Component: GenerativeStrings,
    endpoints: [""],
    thumb: "weather-tree.png",
  },
  bonfire: {
    name: "bonfire",
    attributes: ["lat", "lon", "fireCount"],
    Component: Bonfire,
    endpoints: [""],
    thumb: "bonfire.png",
    openProcessingLink: "https://openprocessing.org/sketch/1749652",
    author: "Pedro Trama",
  },
  nightRain: {
    name: "nightRain",
    attributes: ["rain", "temperature"],
    Component: NightRain,
    endpoints: [""],
    thumb: "night-rain.png",
    openProcessingLink: "https://openprocessing.org/sketch/2318784",
    author: "Richard Bourne",
  },
  windLines: {
    name: "windLines",
    attributes: ["windSpeed"],
    Component: WindLines,
    endpoints: [""],
    thumb: "wind-lines.png",
    openProcessingLink: "https://openprocessing.org/sketch/894918",
    author: "735902144",
  },
  lightningBolts: {
    name: "lightningBolts",
    attributes: ["lightningCount"],
    Component: LightningBolts,
    endpoints: [""],
    thumb: "lightning-bolts.png",
    openProcessingLink: "https://openprocessing.org/sketch/639075",
    author: "Gweltaz Duval-Guennoc",
    patchId: "thunder4",
  },
  burningTrees: {
    name: "burningTrees",
    attributes: ["fireCount"],
    Component: BurningTrees,
    endpoints: [""],
    thumb: "burning-trees.png",
    openProcessingLink: "https://openprocessing.org/sketch/1749652",
    author: "はぅ君",
  },
  airports: {
    name: "Airports",
    attributes: ["lat", "lon"],
    Component: Airports,
    endpoints: [],
    thumb: "",
    author: "Felipe Mammoli",
  },
  riverLines: {
    name: "riverLines",
    attributes: ["humidity", "temperature"],
    Component: RiverLines,
    endpoints: [],
    thumb: "river-lines.png",
    openProcessingLink: "https://openprocessing.org/sketch/1198771",
    author: "Richard Bourne",
  },
  attractor: {
    name: "attractor",
    attributes: ["lightningCount"],
    Component: Attractor,
    endpoints: [],
    thumb: "attractor.png",
    openProcessingLink: "https://openprocessing.org/sketch/394718",
    author: "Masaki Yamabe",
  },
  pump: {
    name: "pump",
    attributes: ["temperature", "windspeed", "windDeg"],
    Component: Pump,
    endpoints: [],
    thumb: "todo",
    openProcessingLink: "https://openprocessing.org/sketch/2711609",
    author:
      "Roots Blower + GaiaSenses (temperatura + vento) Baseado no sketch de Metamere",
  },
};

export default CompositionsInfo;
