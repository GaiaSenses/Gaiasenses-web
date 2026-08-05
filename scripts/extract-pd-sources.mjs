#!/usr/bin/env node
/**
 * Recover the Pure Data sources that are trapped inside a compiled Pd4Web bundle.
 *
 * Historically the only thing versioned for a patch was the compiled output under
 * `public/<slug>/`. The musician's project — the main patch plus its `Libs/`
 * abstractions — survived only inside the binary `pd4web.data`, which means no
 * patch in the repository could be rebuilt, reviewed or edited.
 *
 * The files are recoverable because Pd4Web ships a plain-text manifest inside the
 * generated `pd4web.js`, listing every packed file with its byte range in
 * `pd4web.data`:
 *
 *   {filename:"/Libs/strike-sound.pd",start:409137,end:410028}
 *
 * Older bundles quote the keys, newer ones don't, so both forms are accepted.
 *
 * Usage:
 *   node scripts/extract-pd-sources.mjs <bundleDir> <outDir> [--main <name>]
 *   node scripts/extract-pd-sources.mjs public/thunder4 patches/thunder4
 */

import fs from "node:fs";
import path from "node:path";

/** Files Pd4Web injects into every bundle. They are not part of the musician's project. */
const RUNTIME_FILES = new Set([
  "/InterRegular.ttf",
  "/DejaVuSans.ttf",
  "/pd.lua",
  "/pdx.lua",
]);

const ENTRY_RE =
  /"?filename"?\s*:\s*"([^"]+)"\s*,\s*"?start"?\s*:\s*(\d+)\s*,\s*"?end"?\s*:\s*(\d+)/g;

/** Read the packed-file manifest that Pd4Web embeds in the loader script. */
export function readBundleManifest(bundleDir) {
  const loaderPath = path.join(bundleDir, "pd4web.js");
  const source = fs.readFileSync(loaderPath, "utf8");

  const entries = [];
  for (const match of source.matchAll(ENTRY_RE)) {
    entries.push({
      filename: match[1],
      start: Number(match[2]),
      end: Number(match[3]),
    });
  }

  if (entries.length === 0) {
    throw new Error(
      `No packed-file manifest found in ${loaderPath}. ` +
        `Pd4Web may have changed its data-package format.`,
    );
  }

  return entries;
}

function extract(bundleDir, outDir, mainName) {
  const entries = readBundleManifest(bundleDir);
  const data = fs.readFileSync(path.join(bundleDir, "pd4web.data"));

  const packedTotal = entries.at(-1).end;
  if (packedTotal !== data.length) {
    throw new Error(
      `${bundleDir}: manifest ends at ${packedTotal} bytes but pd4web.data is ` +
        `${data.length} bytes. Refusing to slice a mismatched package.`,
    );
  }

  const written = [];
  let skipped = 0;

  for (const entry of entries) {
    if (RUNTIME_FILES.has(entry.filename)) {
      skipped += 1;
      continue;
    }

    // "/index.pd" is the compiled main patch; it becomes the project's main.pd.
    const relative =
      entry.filename === "/index.pd"
        ? mainName
        : entry.filename.replace(/^\//, "");

    const target = path.join(outDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data.subarray(entry.start, entry.end));
    written.push({ relative, bytes: entry.end - entry.start });
  }

  return { written, skipped };
}

function main() {
  const args = process.argv.slice(2);
  const mainIndex = args.indexOf("--main");
  const mainName = mainIndex === -1 ? "main.pd" : args[mainIndex + 1];
  const positional =
    mainIndex === -1
      ? args
      : args.filter((_, i) => i !== mainIndex && i !== mainIndex + 1);

  if (positional.length !== 2) {
    console.error(
      "Usage: node scripts/extract-pd-sources.mjs <bundleDir> <outDir> [--main main.pd]",
    );
    process.exit(1);
  }

  const [bundleDir, outDir] = positional;
  const { written, skipped } = extract(bundleDir, outDir, mainName);

  console.log(`${bundleDir} -> ${outDir}`);
  for (const file of written) {
    console.log(`  ${String(file.bytes).padStart(8)}  ${file.relative}`);
  }
  console.log(
    `  ${written.length} file(s) written, ${skipped} runtime file(s) skipped.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
