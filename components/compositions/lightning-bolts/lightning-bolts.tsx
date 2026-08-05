import Composition from "../composition";
import LightningBoltsSketch from "./lightning-bolts-sketch";
import CompositionControls from "../composition-controls";
import DebugPanel from "@/components/debug-panel/debug-panel";
import { getLightning } from "@/components/getData";

const low = "/audios/lightningBolts_Low.mp3";
const high = "/audios/lightningBolts_High.mp3";

function getAudio(lightningCount: number) {
  if (lightningCount == 0) {
    return undefined;
  }
  if (lightningCount >= 1 && lightningCount < 4) {
    return low;
  }
  if (lightningCount >= 4) {
    return high;
  }
}

export type LightningBoltsProps = {
  lat: string;
  lon: string;
  lightningCount?: number;
  play: boolean;
  debug?: boolean;
  today?: boolean;
  refresh?: string;
};

export default async function LightningBolts(props: LightningBoltsProps) {
  let lightningCount = props.lightningCount ?? 0;
  let lightningBoltsAudio;

  try {
    if (props.today) {
      const data = await getLightning(props.lat, props.lon, 100);
      // Fonte indisponível não é zero: a animação não tem como desenhar
      // "não sei", então fica no mínimo. Quem avisa o público é o painel
      // de informações, que mostra o estado indisponível em vez de um número.
      lightningCount = data?.count ?? 0;
      console.log(data);
    }
  } catch (error) {
    console.log(error);
  }

  const refreshKey = props.refresh ?? "default";
  //lightningBoltsAudio = getAudio(lightningCount);

  return (
    <Composition>
      <LightningBoltsSketch
        key={refreshKey}
        lightningCount={lightningCount}
        play={props.play}
      />
      <CompositionControls play={props.play} />
      {<DebugPanel data={[{ lightningCount }]} />}
    </Composition>
  );
}
