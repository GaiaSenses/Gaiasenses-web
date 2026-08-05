import { getLightning, getWeather } from "@/components/getData";
import ZigzagSketch from "./zigzag-sketch";
import Composition from "../composition";
import CompositionControls from "../composition-controls";
import DebugPanel from "@/components/debug-panel/debug-panel";

export type ZigZagSketchProps = {
  lat: string;
  lon: string;
  debug?: boolean;
  rain?: number;
  lightningCount?: number;
  today?: boolean;
  play: boolean;
  refresh?: string;
};

const zigzagAA = "/audios/ZigZag-AA.mp3";
const zigzagAB = "/audios/ZigZag-AB.mp3";
const zigzagBA = "/audios/ZigZag-BA.mp3";
const zigzagBB = "/audios/ZigZag-BB.mp3";

function getAudio(rain: number, lCount: number) {
  if (rain > 20) {
    if (lCount > 4) {
      return zigzagAA;
    } else {
      return zigzagAB;
    }
  } else {
    if (lCount > 4) {
      return zigzagBA;
    } else {
      return zigzagBB;
    }
  }
}

export default async function Zigzag(props: ZigZagSketchProps) {
  let rainData = props.rain ?? 0;
  let lightningCount = props.lightningCount ?? 0;
  let audioPath = "";

  try {
    if (props.today) {
      const [weatherData, lightningData] = await Promise.all([
        getWeather(props.lat, props.lon),
        getLightning(props.lat, props.lon, 50),
      ]);
      rainData = weatherData.rain.hasOwnProperty("1h")
        ? (weatherData.rain as { "1h": number })["1h"]
        : 0;

      // Fonte indisponível não é zero: a animação não tem como desenhar
      // "não sei", então fica no mínimo. Quem avisa o público é o painel.
      lightningCount = lightningData?.count ?? 0;
    }
  } catch (error) {
    console.log(error);
  }
  audioPath = getAudio(rainData, lightningCount);
  const refreshKey = props.refresh ?? "default";
  return (
    <Composition>
      <ZigzagSketch
        key={refreshKey}
        rain={rainData}
        lightningCount={lightningCount}
        play={props.play}
      ></ZigzagSketch>
      <CompositionControls
        play={props.play}
        mp3
        patchPath={audioPath}
      ></CompositionControls>
      {<DebugPanel data={[{ rainData, lightningCount }]} />}
    </Composition>
  );
}
