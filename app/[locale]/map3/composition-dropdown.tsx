"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CompositionsInfo from "@/components/compositions/compositions-info";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { usePd4Web } from "./pd4web-context";
import { useEffect, useState } from "react";

type CompositionDropdownProps = {
  searchParams: {
    lat?: string;
    lng?: string;
    composition?: string;
    mode?: string;
  };
};

export function CompositionDropdown({
  searchParams,
}: CompositionDropdownProps) {
  const [selectedComposition, setSelectedComposition] = useState(
    searchParams.composition || "attractor",
  );

  const router = useRouter();

  const { activePatch, startPatch, stopPatch, isInitializing, isStopping } =
    usePd4Web();

  useEffect(() => {
    if (activePatch) {
      console.log("activePatch changed:", activePatch);
    }
  }, [activePatch]);

  async function handleCompositionSelect(composition: string) {
    setSelectedComposition(composition);
  }

  async function handleClick() {
    const compositionInfo =
      CompositionsInfo[selectedComposition as keyof typeof CompositionsInfo];
    const wasMapPatchActive = Boolean(
      activePatch?.activation.moments.includes("map"),
    );

    const params = new URLSearchParams({
      ...searchParams,
      composition: selectedComposition,
      mode: "player",
      play: "true",
    });
    params.set("mapPatchWasOn", wasMapPatchActive ? "true" : "false");

    router.replace(`?${params.toString()}`);

    if (!compositionInfo.keepMapPatch) {
      if (
        activePatch?.activation.moments.includes("map") &&
        !isInitializing &&
        !isStopping
      ) {
        await stopPatch();
      }
      if (compositionInfo.patchId) {
        const startedPatch = await startPatch(compositionInfo.patchId);
        console.log("startedPatch:", startedPatch);
      }
    }
  }

  return (
    <>
      <div className="flex gap-1">
        <Button
          className="w-full capitalize"
          variant={"outline"}
          onClick={handleClick}
          disabled={isInitializing || isStopping}
        >
          {selectedComposition}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size={"icon"}>
              {" "}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>Compositions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={selectedComposition}
              className="overflow-y-scroll h-48"
            >
              {Object.entries(CompositionsInfo).map((item, index) => {
                return (
                  <DropdownMenuRadioItem
                    key={index}
                    value={item[0]}
                    onClick={() => handleCompositionSelect(item[0])}
                  >
                    {item[0]}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
