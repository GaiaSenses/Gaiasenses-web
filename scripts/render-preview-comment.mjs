#!/usr/bin/env node
/**
 * Render the pull-request comment a musician reads after their patch is built.
 *
 * Kept out of the workflow YAML because the listen link is not obvious and the
 * rule belongs next to a test, not inline in a shell step: a patch paired with an
 * animation must reach the player, since it is the animation that drives it —
 * a thunder patch opened on the globe alone is silent by design.
 *
 * `?patch=<id>` handles both cases. The title screen starts that patch and, when
 * it has a composition, forwards into the player for it. Linking straight at the
 * player instead would fail: the composition modal covers the start button, and
 * browsers refuse to start audio without a click.
 *
 * Usage:
 *   node scripts/render-preview-comment.mjs <baseUrl|""> <slug> [...]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = "<!-- gaia-patch-bot -->";

function readManifest(slug) {
  const file = path.join(ROOT, "patches", slug, "patch.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

function readBuildInfo(slug) {
  const file = path.join(ROOT, "public/patches", slug, "build-info.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

export function renderComment(baseUrl, slugs) {
  const built = [];
  const failed = [];

  for (const slug of slugs) {
    const info = readBuildInfo(slug);
    if (info) built.push({ slug, info, manifest: readManifest(slug) });
    else failed.push(slug);
  }

  const lines = [MARKER];

  if (built.length === 0) {
    lines.push(
      "## ✕ Nenhum patch compilou",
      "",
      `Não consegui compilar: ${failed.map((s) => `\`${s}\``).join(", ")}.`,
      "",
      "Abra o log da execução (aba **Actions** acima) para ver a mensagem do compilador.",
      "As causas mais comuns estão no [guia do músico](docs/musico/README.md).",
    );
    return lines.join("\n");
  }

  lines.push("## 🎧 Seu patch está pronto para ouvir", "");

  for (const { slug, manifest } of built) {
    const label = manifest?.label ?? slug;
    const composition = manifest?.activation?.compositions?.[0];
    const link = baseUrl
      ? `${baseUrl}/pt/map3?patch=${encodeURIComponent(slug)}`
      : null;

    lines.push(
      link
        ? `- **[▶ Ouvir “${label}”](${link})**`
        : `- **“${label}”** — abra o preview da Vercel (comentário logo abaixo) e acrescente \`/pt/map3?patch=${slug}\``,
    );
    if (composition) {
      lines.push(`  - toca junto com a animação \`${composition}\``);
    }
  }

  lines.push(
    "",
    "> Ao abrir, clique em **Iniciar** e depois em **Unmute** — o som começa desligado,",
    "> e o navegador só o libera após um clique seu. Use fone de ouvido.",
    "",
    "| Patch | Tamanho | Memória | Runtime |",
    "|---|---|---|---|",
  );

  for (const { slug, info } of built) {
    const kb = Math.round(info.dataBytes / 1024);
    const note = info.prebuilt ? " *(não recompilado)*" : "";
    lines.push(
      `| \`${slug}\`${note} | ${kb} KB | ${info.initialMemory} MB | \`${info.runtime}\` |`,
    );
  }

  if (failed.length > 0) {
    lines.push(
      "",
      `⚠️ Não compilaram: ${failed.map((s) => `\`${s}\``).join(", ")}. Veja o log em **Actions**.`,
    );
  }

  lines.push(
    "",
    "**Não está ouvindo nada?** Pode ser que a sua peça dependa de um dado que agora",
    "vale zero — um patch de trovão fica em silêncio quando não há raios. Abra o",
    "console do navegador (F12) e force um valor:",
    "",
    "```js",
    'Pd4Web.sendBang("bolt")',
    'Pd4Web.sendFloat("gaia.temp", 38)',
    "```",
    "",
    "Quer ajustar? Suba o arquivo corrigido **nesta mesma branch** e eu recompilo sozinho.",
    "",
    "<sub>🤖 Robô do GaiaSenses · [guia do músico](docs/musico/README.md) · [vocabulário](docs/musico/vocabulario.md)</sub>",
  );

  return lines.join("\n");
}

export { MARKER };

function main() {
  const [baseUrl, ...slugs] = process.argv.slice(2);
  if (slugs.length === 0) {
    console.error(
      'Usage: node scripts/render-preview-comment.mjs <baseUrl|""> <slug> [...]',
    );
    process.exit(1);
  }
  process.stdout.write(renderComment(baseUrl || null, slugs));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
