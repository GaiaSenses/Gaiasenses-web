"use client";

import { Button } from "@/components/ui/button";
import { usePd4Web } from "./pd4web-context";

export default function MuteButton() {
  const { isMuted, toggleMute } = usePd4Web();

  return (
    <Button variant="secondary" size="sm" onClick={toggleMute}>
      {isMuted ? "Unmute" : "Mute"}
    </Button>
  );
}