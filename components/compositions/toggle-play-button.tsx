"use client";
import { PauseIcon, PlayIcon } from "@radix-ui/react-icons";
import { Button } from "../ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MouseEvent } from "react";
import { usePd4Web } from "@/app/[locale]/map3/pd4web-context";
import { MAP3_PD4WEB_PATCHES } from "@/app/[locale]/map3/pd4web-patches";

export default function TogglePlayButton({
  play,
  onPlay,
  onPause,
}: {
  play: boolean;
  onPlay?: (play?: boolean) => void;
  onPause?: (play?: boolean) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const { stopPatch, activePatch, isInitializing, isStopping, startPatch } =
    usePd4Web();

  async function togglePlay(
    event: MouseEvent<HTMLDivElement | HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const newParams = new URLSearchParams();

    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const composition = searchParams.get("composition");
    const debug = searchParams.get("debug");

    newParams.set("lat", lat ?? "0");
    newParams.set("lng", lng ?? "0");
    newParams.set("mode", "map");
    newParams.set("composition", composition ?? "attractor");
    if (debug === "true") newParams.set("debug", "true");

    const newPlayStatus = !play;
    newParams.set("play", newPlayStatus.toString());

    if (newPlayStatus) {
      if (onPlay) onPlay(newPlayStatus);
      // if (window) {
      //   window.scrollTo({ left: window.innerWidth, behavior: "smooth" });
      // }
    } else {
      if (onPause) onPause(newPlayStatus);
      if (activePatch && !isInitializing && !isStopping) {
        await stopPatch();
        const mapPatch = MAP3_PD4WEB_PATCHES.find((patch) =>
          patch.activation.moments.includes("map"),
        );
        if (mapPatch) {
          startPatch(mapPatch.id);
        }
      }
    }

    //newParams.delete("compositionName");
    //newParams.set("play", "false");
    //newParams.set("today", "true");
    newParams.set("initial", "false");
    router.replace(`${pathname}?${newParams.toString()}`);
  }

  return (
    <div
      onClick={togglePlay}
      className="absolute top-0 h-full w-full flex items-center justify-center"
    >
      <Button
        variant={"outline"}
        size={"icon"}
        className={`rounded-full w-[100px] h-[100px] border-4 hover:opacity-80 transition-transform  ${
          !play ? "opacity-100 bg-[rgba(255,255,255,0.5)]" : "opacity-0"
        }`}
        onClick={togglePlay}
      >
        {play ? (
          <PauseIcon height={80} width={80} strokeOpacity={0.8}></PauseIcon>
        ) : (
          <PlayIcon height={80} width={80} strokeOpacity={0.8}></PlayIcon>
        )}
      </Button>
    </div>
  );
}
