"use client";
// An implementation of Brian Eno's 1975 Discrete Music
// Based on
//https://teropa.info/blog/2016/07/28/javascript-systems-music.html#putting-it-together-launching-the-loops
import { Button } from "@/components/ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import TogglePlayButton from "@/components/compositions/toggle-play-button";

export default function Discrete({ play }: { play: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);

  const toneRef = useRef<any>(null);
  const initializedRef = useRef(false);

  async function buildDiscreteMusic() {
    if (initializedRef.current && toneRef.current) {
      // Already set up — just resume the audio context and restart the transport
      await toneRef.current.start();
      toneRef.current.getTransport().start();
      setIsPlaying(true);
      return;
    }
    if (initializedRef.current) {
      // First call is still in-flight (async import not yet resolved); skip
      return;
    }
    initializedRef.current = true;

    const Tone = await import("tone");

    toneRef.current = Tone;

    await toneRef.current.start();
    function makeSynth() {
      //@ts-expect-error not managing to make this type work with dynamic imports
      const envelope: RecursivePartial<Omit<Tone.EnvelopeOptions, "context">> =
        {
          attack: 0.1,
          release: 4,
          releaseCurve: "linear",
        };
      //@ts-expect-error not managing to make this type work with dynamic imports
      const filterEnvelope: RecursivePartial<
        //@ts-expect-error not managing to make this type work with dynamic imports
        Omit<Tone.FrequencyEnvelopeOptions, "context">
      > = {
        baseFrequency: 200,
        octaves: 2,
        attack: 0,
        decay: 0,
        release: 1000,
      };
      const synth = new toneRef.current.DuoSynth({
        harmonicity: 1,
        volume: -20,
        voice0: {
          oscillator: { type: "sawtooth" },
          envelope: envelope,
          filterEnvelope: filterEnvelope,
        },
        voice1: {
          oscillator: { type: "sine" },
          envelope: envelope,
          filterEnvelope: filterEnvelope,
        },
        vibratoRate: 0.5,
        vibratoAmount: 0.1,
      });
      return synth;
    }
    const leftSynth = makeSynth();
    const rightSynth = makeSynth();

    const leftPanner = new toneRef.current.Panner(-0.5);
    const rightPanner = new toneRef.current.Panner(0.5);

    const EQUALIZER_CENTER_FREQUENCIES = [
      100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000,
      2500, 3150, 4000, 5000, 6300, 8000, 10000,
    ];
    const equalizer = EQUALIZER_CENTER_FREQUENCIES.map((frequency) => {
      const filter = toneRef.current.getContext().createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = frequency;
      filter.Q.value = 4.31;
      filter.gain.value = 0;
      return filter;
    });

    const echo = new toneRef.current.FeedbackDelay("16n", 0.2);

    const delay = toneRef.current.getContext().createDelay(6.0);

    const delayFade = toneRef.current.getContext().createGain();

    delay.delayTime.value = 6.0;
    delayFade.gain.value = 0.75;

    leftSynth.connect(leftPanner);
    rightSynth.connect(rightPanner);

    leftPanner.connect(equalizer[0]);
    rightPanner.connect(equalizer[0]);
    equalizer.forEach((equalizerBand, index) => {
      if (index < equalizer.length - 1) {
        // Connect to next equalizer band
        equalizerBand.connect(equalizer[index + 1]);
      } else {
        // This is the last band, connect it to the echo
        //a static helper to connect web audio notes to Tonejs nodes
        toneRef.current.connect(equalizerBand, echo);
      }
    });
    echo.connect(delay);

    delay.connect(toneRef.current.getContext().rawContext.destination);
    delay.connect(delayFade);
    delayFade.connect(delay);

    new toneRef.current.Loop((time: number) => {
      leftSynth.triggerAttackRelease("C5", "1:2", time);
      leftSynth.setNote("D5", "+0:2");

      // Trigger E4 after 6 measures and hold for two 1/4 notes.
      leftSynth.triggerAttackRelease("E4", "0:2", "+6:0");

      // Trigger G4 after 11 measures + a two 1/4 notes, and hold for two 1/4 notes.
      leftSynth.triggerAttackRelease("G4", "0:2", "+11:2");

      // Trigger E5 after 19 measures and hold for 2 measures.
      // Switch to G5, A5, G5 after delay of a 1/4 note + two 1/16 notes each.
      leftSynth.triggerAttackRelease("E5", "2:0", "+19:0");
      leftSynth.setNote("G5", "+19:1:2");
      leftSynth.setNote("A5", "+19:3:0");
      leftSynth.setNote("G5", "+19:4:2");
    }, "34m").start(0);

    new toneRef.current.Loop((time: number) => {
      // Trigger D4 after 5 measures and hold for 1 full measure + two 1/4 notes
      rightSynth.triggerAttackRelease("D4", "1:2", "+5:0");
      // Switch to E4 after one more measure
      rightSynth.setNote("E4", "+6:0");

      // Trigger B3 after 11 measures + two 1/4 notes + two 1/16 notes. Hold for one measure
      rightSynth.triggerAttackRelease("B3", "1m", "+11:2:2");
      // Switch to G3 after a 1/2 note more
      rightSynth.setNote("G3", "+12:0:2");

      // Trigger G4 after 23 measures + two 1/4 notes. Hold for a half note.
      rightSynth.triggerAttackRelease("G4", "0:2", "+23:2");
    }, "37m").start(0);

    //Tone.getTransport().bpm.value = 240;
    toneRef.current.getTransport().start();

    setIsPlaying(true);
    console.log("play");
  }

  useEffect(() => {
    buildDiscreteMusic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function playMusic() {
    buildDiscreteMusic();
  }

  async function stop() {
    toneRef.current.getTransport().pause();
    toneRef.current.getContext().rawContext.suspend(0);
    setIsPlaying(false);

    const newParams = new URLSearchParams(searchParams.toString());

    const newPlayStatus = !play;
    newParams.set("play", newPlayStatus.toString());
    newParams.set("mode", "map");
    //newParams.delete("compositionName");
    //newParams.set("play", "false");
    //newParams.set("today", "true");
    newParams.set("initial", "false");
    router.replace(`${pathname}?${newParams.toString()}`);
  }

  return (
    <>
      <div className="absolute bottom-0 right-0">
        <div className="bg-white p-2">
          <div>
            <p>Discrete Music from Brian Eno - 1975</p>
          </div>

          {/* <div>
            {isPlaying ? (
              <Button onClick={stop}>Stop</Button>
            ) : (
              <Button onClick={playMusic}>Play</Button>
            )}
          </div> */}
        </div>
      </div>
      <TogglePlayButton
        play={play}
        onPlay={playMusic}
        onPause={stop}
      ></TogglePlayButton>
    </>
  );
}
