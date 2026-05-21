"use client";
import { Button } from "@/components/ui/button";

import { ReactNode, useState, AnimationEvent } from "react";
import { usePd4Web } from "./pd4web-context";
import { start } from "repl";
import { MAP3_PD4WEB_PATCHES } from "./pd4web-patches";

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

  const { startPatch, isInitializing } = usePd4Web();

  function onClick() {
    if (state == "idle") setState("animating");
    const mapPatch = MAP3_PD4WEB_PATCHES.find((patch) =>
      patch.activation.moments.includes("map"),
    );
    if (mapPatch) {
      const patch = startPatch(mapPatch.id);
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
