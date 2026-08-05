#!/usr/bin/env node
/**
 * Remove WebAssembly runtimes that no patch points at any more.
 *
 * Content addressing keeps identical runtimes from being stored twice, but on
 * its own it only ever grows: every rebuild that produces different bytes adds a
 * directory and orphans the previous one. Collecting the unreferenced ones is
 * the other half of the scheme.
 *
 * Rebuilds do produce different bytes across machines. The build is reproducible
 * on one machine — a fixed workspace and a pinned SOURCE_DATE_EPOCH make two
 * patches with the same object set land on the same hash — but the absolute path
 * of the checkout is baked into the binary, and that path differs between a
 * laptop and a CI runner. So a build on the runner legitimately mints new
 * runtimes and strands the ones built locally.
 *
 * The set to keep is whatever `public/patches/<slug>/build-info.json` references.
 * That covers patches this run did not rebuild: their build-info is still in the
 * checkout, pointing at a runtime that must survive.
 *
 * Usage:
 *   node scripts/gc-pd4web-runtimes.mjs            # delete orphans
 *   node scripts/gc-pd4web-runtimes.mjs --dry-run  # only report
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_DIR = path.join(ROOT, "public/pd4web-runtime");
const PATCHES_OUT = path.join(ROOT, "public/patches");

function referencedRuntimes() {
  if (!fs.existsSync(PATCHES_OUT)) return new Set();

  const referenced = new Set();
  for (const slug of fs.readdirSync(PATCHES_OUT)) {
    const infoPath = path.join(PATCHES_OUT, slug, "build-info.json");
    if (!fs.existsSync(infoPath)) continue;
    try {
      const { runtime } = JSON.parse(fs.readFileSync(infoPath, "utf8"));
      if (runtime) referenced.add(runtime);
    } catch (error) {
      // A build-info we cannot read is a reason to keep everything, not to
      // delete blindly — bailing out is the safe failure here.
      throw new Error(
        `Não consegui ler ${path.relative(ROOT, infoPath)}: ${error.message}. ` +
          `Abortando para não apagar um runtime em uso.`,
      );
    }
  }
  return referenced;
}

function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!fs.existsSync(RUNTIME_DIR)) {
    console.log("Nenhum runtime instalado.");
    return;
  }

  const referenced = referencedRuntimes();
  if (referenced.size === 0) {
    console.error(
      "Nenhum build-info.json encontrado. Abortando: sem saber o que está em " +
        "uso, apagar seria destrutivo.",
    );
    process.exit(1);
  }

  const present = fs
    .readdirSync(RUNTIME_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const orphans = present.filter((hash) => !referenced.has(hash));

  for (const hash of orphans) {
    const dir = path.join(RUNTIME_DIR, hash);
    const bytes = fs.existsSync(path.join(dir, "pd4web.wasm"))
      ? fs.statSync(path.join(dir, "pd4web.wasm")).size
      : 0;
    console.log(
      `${dryRun ? "removeria" : "removido"}  ${hash}  (${(bytes / 1048576).toFixed(1)} MB)`,
    );
    if (!dryRun) fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(
    `${referenced.size} runtime(s) em uso, ${orphans.length} órfão(s)` +
      `${dryRun ? " (nada foi apagado)" : " removido(s)"}.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
