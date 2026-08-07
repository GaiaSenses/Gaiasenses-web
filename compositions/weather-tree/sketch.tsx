"use client";
//@ts-ignore this is generating require calls, should look into that
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
//@ts-ignore this is generating require calls, should look into that
import { NextReactP5Wrapper } from "@p5-wrapper/next";

export type WeatherTreeSketchProps = {
  play: boolean;
};

function sketch(p5: P5CanvasInstance<SketchProps & WeatherTreeSketchProps>) {
  // inspired by: https://openprocessing.org/sketch/1780681
  let play = false;

  let [width, height] = [p5.windowWidth, p5.windowHeight];
  let canvas: any | null = null;

  let x = -width / 2;
  let y = 50;
  let theta = 0;
  let dir = true;
  let posX = 0;
  let treeColor: any;

  const branch = (h: number) => {
    h *= 0.66;
    if (h > 2) {
      p5.strokeWeight(h / 15 + 0.5);
      p5.push(); // Save the current state of transformation (i.e. where are we now)
      p5.rotate(theta); // Rotate by theta
      p5.line(0, 0, 0, -h); // Draw the branch
      p5.translate(0, -h); // Move to the end of the branch
      branch(h); // Ok, now call myself to draw two new branches!!
      p5.pop(); // Whenever we get back here, we "pop" in order to restore the previous matrix state

      // Repeat the same thing, only branch off to the "left" this time!
      p5.push();
      p5.rotate(-theta);
      p5.line(0, 0, 0, -h);
      p5.translate(0, -h);
      branch(h);
      p5.pop();
    }
  };

  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(width, height, p5.P2D);

    p5.background(0);
    p5.frameRate(20);

    treeColor = p5.color(p5.random(255), p5.random(255), p5.random(255));
  };

  p5.updateWithProps = (props: any) => {
    play = props.play;

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    if (
      p5.mouseX < width &&
      p5.mouseX > 0 &&
      p5.mouseY < height &&
      p5.mouseY > 0
    ) {
      posX = p5.mouseX;
    }
    p5.background(0);

    p5.stroke(treeColor);
    p5.strokeWeight(width / 70);
    // Let's pick an angle 0 to 90 degrees based on the mouse position
    let a = (posX / width) * 90;
    // Convert it to radians
    theta = p5.radians(a);
    // Start the tree from the bottom of the screen
    p5.translate(width / 2, height);
    // Draw a line
    p5.line(0, 0, 0, -height / 3);
    // Move to the end of that line
    p5.translate(0, -height / 3);
    // Start the recursive branching!
    branch(height / 3);
    p5.fill(treeColor);
    p5.ellipse(x, y, 20, 20);
    if (dir) {
      x += 10;
    } else {
      x -= 10;
    }
    if (x > width / 2) {
      dir = false;
    } else if (x < -width / 2) {
      dir = true;
    }
  };
}

export default function WeatherTreeSketch(props: WeatherTreeSketchProps) {
  return <NextReactP5Wrapper sketch={sketch} {...props} />;
}
