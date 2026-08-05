"use client";
import { Button } from "@/components/ui/button";

import { ReactNode, useState, AnimationEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePd4Web } from "./pd4web-context";
import { getMap3Pd4WebPatchById, MAP3_PD4WEB_PATCHES } from "./pd4web-patches";

export default function TitleScreen({
  children,
  show,
  title,
  subtitle,
  titleButtonText,
}: {
  children?: ReactNode;
  show: boolean;
  title: string;
  subtitle: string;
  titleButtonText: string;
}) {
  const [state, setState] = useState<"idle" | "animating" | "ended">(
    show === false ? "ended" : "idle",
  );

  const { startPatch } = usePd4Web();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  async function onClick() {
    if (state == "idle") setState("animating");

    // `?patch=<id>` forces a specific patch instead of the map soundscape. This
    // is how a musician auditions their own work: the bot comment on their pull
    // request links straight to the preview with their patch id, so one click
    // plays it in the real map, with live data — no dev involved.
    const requestedId = searchParams?.get("patch");
    const requested = requestedId ? getMap3Pd4WebPatchById(requestedId) : null;

    const patch =
      requested ??
      MAP3_PD4WEB_PATCHES.find((entry) =>
        entry.activation.moments.includes("map"),
      );

    if (!patch) return;

    await startPatch(patch.id);

    // A patch paired with an animation is driven by that animation's events —
    // thunder4 only sounds when lightningBolts draws a bolt. Starting it on the
    // globe alone would be silence, so send the visitor into the player too.
    // The link cannot simply point at the player: the composition modal renders
    // over this screen and swallows the click that browsers require before any
    // audio may start.
    const composition = requested?.activation.compositions?.[0];
    if (composition) {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("composition", composition);
      params.set("mode", "player");
      params.set("play", "true");
      router.replace(`${pathname}?${params.toString()}`);
    }
  }

  function onAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    e.stopPropagation();
    setState("ended");
  }

  return (
    <div
      className={`top-0 left-0 w-full grid h-full content-center gap-10 mix-blend-darken bg-black relative ${
        (state === "animating" || state === "ended") &&
        //"animate-title-page mix-blend-normal"
        "animate-background-color-fade"
      } ${state === "ended" && "-z-50"}`}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="max-w-full  md:max-w-[40rem] self-center justify-self-center px-2">
        <h1 className="text-white font-extrabold leading-[0.7em] text-[5rem] md:text-[10rem]">
          {title}
        </h1>
      </div>
      <div className=" self-center justify-self-center max-w-full  md:max-w-[40rem] px-2 ">
        <h2 className="text-white text-[2rem] md:text-[4rem] font-pop font-semibold leading-tight md:leading-[0.9em] [text-shadow:_0px_1px_1px_rgba(255,255,255,0.6)]">
          {subtitle}
        </h2>
      </div>
      <div className=" self-center justify-self-center max-w-full  md:max-w-[40rem] px-2 isolation-auto">
        <Button
          variant={"link"}
          className="text-white text-[2rem] md:text-[2rem] font-pop font-semibold leading-tight md:leading-[0.9em] [text-shadow:_0px_1px_1px_rgba(255,255,255,0.6)] z-50"
          onClick={onClick}
        >
          {titleButtonText}
        </Button>
      </div>
    </div>
  );
}
