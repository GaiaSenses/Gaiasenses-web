import test from "node:test";
import assert from "node:assert/strict";
import { mapInteractionProps } from "../app/[locale]/map3/map-interaction-lock";

test("sem a bola, o mouse e o toque mexem no mapa livremente", () => {
  assert.deepEqual(mapInteractionProps(false), {
    dragPan: true,
    dragRotate: true,
    keyboard: true,
    doubleClickZoom: true,
    touchPitch: true,
    touchZoomRotate: true,
    scrollZoom: true,
  });
});

test("com a bola conectada, nada que mova o centro ou o rumo fica ligado", () => {
  const locked = mapInteractionProps(true);
  assert.equal(locked.dragPan, false, "arrastar move o centro");
  assert.equal(locked.dragRotate, false, "arrastar com o botão direito gira o rumo");
  assert.equal(locked.keyboard, false, "as setas movem o centro");
  assert.equal(locked.doubleClickZoom, false, "o duplo clique recentra no ponto clicado");
  assert.equal(locked.touchPitch, false);
  assert.equal(locked.touchZoomRotate, false, "a pinça gira o rumo e desloca o centro");
});

test("com a bola conectada, a roda do mouse ainda dá zoom, sempre no centro", () => {
  assert.deepEqual(mapInteractionProps(true).scrollZoom, { around: "center" });
});

test("o mesmo estado devolve o mesmo objeto (o mapa não reaplica os controles à toa)", () => {
  assert.equal(mapInteractionProps(true), mapInteractionProps(true));
  assert.equal(mapInteractionProps(false), mapInteractionProps(false));
});
