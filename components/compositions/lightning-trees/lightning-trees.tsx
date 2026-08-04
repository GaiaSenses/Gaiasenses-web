import Composition from "../composition";
import LightningTreesSketch from "./lightning-trees-sketch";
import CompositionControls from "../composition-controls";
import DebugPanel from "@/components/debug-panel/debug-panel";
import { getLightning } from "@/components/getData";

export type LightningTreesProps = {
  lat: string;
  lon: string;
  lightningCount?: number;
  play: boolean;
  debug?: boolean;
  today?: boolean;
  refresh?: string;
};

export default async function LightningTrees(props: LightningTreesProps) {
  let lightningCount = props.lightningCount ?? 0;
  try {
    if (props.today) {
      const data = await getLightning(props.lat, props.lon, 100);
      lightningCount = data.count;
    }
  } catch (error) {
    console.log(error);
  }

  const refreshKey = props.refresh ?? "default";

  return (
    <Composition>
      <LightningTreesSketch
        key={refreshKey}
        lightningCount={lightningCount}
        play={props.play}
      />
      <CompositionControls play={props.play} />
      {<DebugPanel data={[{ lightningCount }]} />}
    </Composition>
  );
}
