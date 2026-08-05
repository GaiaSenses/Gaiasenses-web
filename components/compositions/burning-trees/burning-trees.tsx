import { getFireSpots } from "@/components/getData";
import Composition from "../composition";
import BurningTreesSketch from "./burning-trees-sketch";
import CompositionControls from "../composition-controls";
import DebugPanel from "@/components/debug-panel/debug-panel";

const noFire = "/audios/burningTrees_noFire.wav";
const fireNoise = "/audios/burningTrees_audio.mp3" ;

function getAudio(fireCount: number){
  if (fireCount == 0){return noFire;}
  else{return fireNoise}
}

export type BurningTreesProps = {
  lat: string;
  lon: string;
  fireCount?: number;
  play: boolean;
  debug?: boolean;
  today?: boolean;
  refresh?: string;
};

export default async function BurningTrees(props: BurningTreesProps) {
  let fireCount = props.fireCount ?? 0;
  let burningTreesAudio;

  try {
    if (props.today) {
      const fireData = await getFireSpots(props.lat, props.lon, 100);
      // Fonte indisponível não é zero: a animação não tem como desenhar
      // "não sei", então fica no mínimo. Quem avisa o público é o painel
      // de informações, que mostra o estado indisponível em vez de um número.
      fireCount = fireData?.count ?? 0;
    }
  } catch (error) {
    console.log(error);
  }

  const refreshKey = props.refresh ?? "default";
  burningTreesAudio = getAudio(fireCount)

  return (
  <Composition>
    <BurningTreesSketch key={refreshKey} fireCount={fireCount} play={props.play} />
    <CompositionControls play={props.play} mp3 patchPath={burningTreesAudio}/>
    {<DebugPanel data={[{ fireCount }]} />}
  </Composition>
  );
}
