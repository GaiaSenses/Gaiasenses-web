/**
 * Contract tests for the links the robot posts on a pull request.
 *
 * These are the first thing a musician clicks, and a wrong one wastes their
 * time in a way that looks like a broken piece rather than a broken link.
 *
 * The composition link shipped once pointing straight at the player, with
 * `mode=player&play=true`. The animation drew and no sound ever came: browsers
 * refuse to start audio without a gesture, and landing inside the player is
 * exactly what skips the gesture. The warning was already written at the top of
 * render-preview-comment.mjs, about the patch link, and repeated anyway.
 *
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { renderCompositionPreviewComment } from "@/scripts/render-preview-comment.mjs";

const BASE = "https://exemplo.vercel.app";

function linkDe(corpo: string): string {
  const achado = corpo.match(/\]\((https:\/\/[^)]+)\)/);
  assert.ok(achado, "o comentário não trouxe link nenhum");
  return achado[1];
}

describe("link de preview de animação", () => {
  const corpo = renderCompositionPreviewComment(BASE, ["bonfire"]);
  const url = new URL(linkDe(corpo));

  /**
   * O ponto todo: o link precisa cair onde há um botão para clicar, porque o
   * clique é o que libera o áudio.
   */
  test("não pula a tela inicial", () => {
    assert.equal(
      url.searchParams.get("mode"),
      null,
      "com mode=player o link cai dentro da animação e o som nunca começa",
    );
    assert.equal(url.searchParams.get("play"), null);
  });

  test("pré-seleciona a animação", () => {
    assert.equal(url.searchParams.get("composition"), "bonfire");
  });

  /**
   * A middleware só preenche lat/lng quando o next-intl redireciona, e uma URL
   * que já traz o idioma não redireciona. Sem coordenadas explícitas o link
   * fica à mercê do que sobrar.
   */
  test("leva coordenadas explícitas", () => {
    assert.ok(Number.isFinite(Number(url.searchParams.get("lat"))));
    assert.ok(Number.isFinite(Number(url.searchParams.get("lng"))));
  });

  test("diz ao músico que são dois cliques", () => {
    assert.match(corpo, /Iniciar/);
  });

  /** O comentário do patch e o da animação não podem se sobrescrever. */
  test("usa marcador próprio", () => {
    assert.match(corpo, /<!-- gaia-composition-preview-bot -->/);
  });

  /**
   * Uma animação que um patch do mesmo envio já sonoriza não é listada: o link
   * do patch abre o player dela, e listar de novo só duplicaria.
   */
  test("omite a animação que um patch do mesmo envio pareia", () => {
    const comPar = renderCompositionPreviewComment(BASE, ["bonfire"], ["bonfire"]);
    assert.equal(comPar, "");
  });
});
