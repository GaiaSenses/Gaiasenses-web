#!/usr/bin/env node
/**
 * Render the pull-request comments a musician reads after their patch is built.
 *
 * There are two, with separate markers, because they arrive at different times
 * and would otherwise overwrite each other. Measured on the first real run:
 * Vercel finishes deploying at 00:11 and the patch build at 00:14, so a single
 * shared comment always ended up as the build's version — without the link,
 * which is the part the musician actually needs.
 *
 *   --build    → what compiled, how big, what to do if it failed
 *   --preview  → where to click to listen, once the deployment URL exists
 *
 * The listen link is `?patch=<id>` in both cases. That parameter starts the
 * patch and, when the patch declares a composition, forwards into the player for
 * it — a patch driven by an animation is silent on the globe alone. Linking
 * straight at the player does not work either: the composition modal covers the
 * start button, and browsers refuse to start audio without a click.
 *
 * Usage:
 *   node scripts/render-preview-comment.mjs --build <slug> [...]
 *   node scripts/render-preview-comment.mjs --preview <baseUrl> <slug> [...]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const BUILD_MARKER = "<!-- gaia-build-bot -->";
export const PREVIEW_MARKER = "<!-- gaia-preview-bot -->";
/**
 * Marcador próprio. Com o mesmo do patch, os dois comentários se sobrescreviam
 * quando alguém envia patch e animação no mesmo pull request — que é
 * justamente o caso que este fluxo existe para atender.
 */
export const COMPOSITION_PREVIEW_MARKER = "<!-- gaia-composition-preview-bot -->";

function readManifest(slug) {
  const file = path.join(ROOT, "patches", slug, "patch.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

function readBuildInfo(slug) {
  const file = path.join(ROOT, "public/patches", slug, "build-info.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

function split(slugs) {
  const built = [];
  const failed = [];
  for (const slug of slugs) {
    const info = readBuildInfo(slug);
    if (info) built.push({ slug, info, manifest: readManifest(slug) });
    else failed.push(slug);
  }
  return { built, failed };
}

export function renderBuildComment(slugs) {
  const { built, failed } = split(slugs);
  const lines = [BUILD_MARKER];

  if (built.length === 0) {
    return [
      ...lines,
      "## ✕ Nenhum patch compilou",
      "",
      `Não consegui compilar: ${failed.map((s) => `\`${s}\``).join(", ")}.`,
      "",
      "Abra a aba **Actions** acima para ver a mensagem do compilador. As causas",
      "mais comuns — e como resolver cada uma — estão no",
      "[guia do músico](docs/musico/README.md).",
    ].join("\n");
  }

  lines.push(
    "## ✅ Compilou",
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
    "O link para ouvir aparece em outro comentário assim que a Vercel terminar",
    "de publicar o preview — leva cerca de dois minutos.",
    "",
    "<sub>🤖 Robô do GaiaSenses · [guia do músico](docs/musico/README.md) · [vocabulário](docs/musico/vocabulario.md)</sub>",
  );

  return lines.join("\n");
}

export function renderPreviewComment(baseUrl, slugs) {
  const { built } = split(slugs);
  const url = baseUrl.replace(/\/$/, "");
  const lines = [PREVIEW_MARKER, "## 🎧 Ouça o seu patch", ""];

  const listable = built.length > 0 ? built : slugs.map((slug) => ({ slug, manifest: readManifest(slug) }));

  for (const { slug, manifest } of listable) {
    const label = manifest?.label ?? slug;
    const composition = manifest?.activation?.compositions?.[0];
    lines.push(
      `- **[▶ Ouvir “${label}”](${url}/pt/map3?patch=${encodeURIComponent(slug)})**` +
        (composition ? ` — toca com a animação \`${composition}\`` : ""),
    );
  }

  lines.push(
    "",
    "> Ao abrir, clique em **Iniciar** e depois em **Unmute** — o som começa",
    "> desligado, e o navegador só o libera após um clique seu. Use fone de ouvido.",
    "",
    "**Não está ouvindo nada?** Pode ser que a sua peça dependa de um dado que",
    "agora vale zero — um patch de trovão fica em silêncio quando não há raios.",
    "Abra o console do navegador (F12) e force um valor:",
    "",
    "```js",
    'Pd4Web.sendBang("bolt")',
    'Pd4Web.sendFloat("gaia.temp", 38)',
    "```",
    "",
    "Quer ajustar? Suba o arquivo corrigido **nesta mesma branch** e eu recompilo sozinho.",
    "",
    "<sub>🤖 Robô do GaiaSenses · [guia do músico](docs/musico/README.md)</sub>",
  );

  return lines.join("\n");
}

/**
 * O mesmo comentário de preview, para quem enviou uma animação.
 *
 * O link aponta direto para o player daquela animação, e não para o globo: uma
 * animação declarada não é escolhida pelo clima até que alguém a acrescente às
 * categorias, então o sorteio não a mostraria. Quem acabou de enviá-la quer vê-la
 * na hora.
 *
 * Se a animação também tem um patch pareado, o link com `?patch=` já cobre os
 * dois — o patch abre o player da animação dele sozinho. Por isso este
 * comentário só lista animações que ninguém sonorizou neste mesmo envio.
 */
export function renderCompositionPreviewComment(baseUrl, slugs, pairedIds = []) {
  const url = baseUrl.replace(/\/$/, "");
  const lines = [COMPOSITION_PREVIEW_MARKER, "## 🎬 Veja a sua animação", ""];

  for (const slug of slugs) {
    const file = path.join(ROOT, "compositions", slug, "composition.json");
    if (!fs.existsSync(file)) continue;

    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    if (pairedIds.includes(manifest.id)) continue;

    const query = `?mode=player&composition=${encodeURIComponent(manifest.id)}&play=true`;
    lines.push(
      `- **[▶ Ver “${manifest.label}”](${url}/pt/map3${query})**` +
        (manifest.attributes?.length
          ? ` — usa ${manifest.attributes.map((a) => `\`${a}\``).join(", ")}`
          : " — não usa dado nenhum"),
    );
  }

  if (lines.length === 3) return "";

  lines.push(
    "",
    "> A animação recebe o clima **do lugar para onde o link aponta**. Troque",
    "> `lat` e `lon` na barra de endereço para ver como ela responde a outro",
    "> tempo — um sketch de chuva fica parado num dia seco, e isso está certo.",
    "",
    "Quer ajustar? Suba o arquivo corrigido **nesta mesma branch** e eu republico.",
    "",
    "<sub>🤖 Robô do GaiaSenses · [guia do músico](docs/musico/README.md)</sub>",
  );

  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (mode === "--composition-preview") {
    const [baseUrl, ...resto] = args.slice(1);
    const corte = resto.indexOf("--paired");
    const slugs = corte === -1 ? resto : resto.slice(0, corte);
    const paired = corte === -1 ? [] : resto.slice(corte + 1);
    if (!baseUrl || slugs.length === 0) process.exit(1);
    process.stdout.write(renderCompositionPreviewComment(baseUrl, slugs, paired));
    return;
  }

  if (mode === "--build") {
    const slugs = args.slice(1);
    if (slugs.length === 0) process.exit(1);
    process.stdout.write(renderBuildComment(slugs));
    return;
  }

  if (mode === "--preview") {
    const [baseUrl, ...slugs] = args.slice(1);
    if (!baseUrl || slugs.length === 0) process.exit(1);
    process.stdout.write(renderPreviewComment(baseUrl, slugs));
    return;
  }

  console.error(
    "Usage:\n" +
      "  node scripts/render-preview-comment.mjs --build <slug> [...]\n" +
      "  node scripts/render-preview-comment.mjs --preview <baseUrl> <slug> [...]\n" +
      "  node scripts/render-preview-comment.mjs --composition-preview <baseUrl> <slug> [...] [--paired <id> ...]",
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
