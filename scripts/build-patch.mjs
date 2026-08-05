#!/usr/bin/env node
/**
 * Compile a patch with Pd4Web and install the result into `public/`.
 *
 * Runs the same steps locally and in CI, so a green build on a laptop means the
 * same thing as a green build on a runner:
 *
 *   1. compile `patches/<slug>/main.pd` into a scratch folder
 *   2. check the generated loader (relocatable, ES module, expected files)
 *   3. store the `.wasm` under `public/pd4web-runtime/<sha>/`, reusing it when an
 *      identical runtime already exists
 *   4. install `pd4web.js` + `pd4web.data` into `public/patches/<slug>/`
 *
 * Only the runtime and the data package ship. `index.pd` is dropped because the
 * patch is already inside `pd4web.data` and `openPatch("index.pd")` reads it
 * from the in-memory filesystem, never from disk. `pd4web.threads.js` is dropped
 * because it is byte-identical across bundles and served once from
 * `public/pd4webShared/` (see app/[locale]/layout.tsx).
 *
 * Usage:
 *   node scripts/build-patch.mjs <slug> [...]     # named patches
 *   node scripts/build-patch.mjs --all
 */

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listPatchSlugs, loadPatches } from "./patch-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_DIR = path.join(ROOT, "public/pd4web-runtime");
const OUTPUT_ROOT = path.join(ROOT, "public/patches");
const SHARED_THREADS = path.join(ROOT, "public/pd4webShared/pd4web.threads.js");

/**
 * Fixed workspace for every compilation. See buildPatch() for why this must not
 * vary per patch. Ignored by git.
 */
const WORKSPACE_NAME = ".pd4web-build";

/**
 * Fixed build clock, so the timestamp Pure Data bakes into the binary does not
 * make every rebuild produce a different runtime. 2023-11-14T22:13:20Z — the
 * exact value is arbitrary, only its stability matters.
 */
const SOURCE_DATE_EPOCH = 1700000000;

/** Upper bounds that keep one heavy patch from bloating every page load. */
const MAX_DATA_BYTES = 8 * 1024 * 1024;
const MAX_WASM_BYTES = 6 * 1024 * 1024;

function resolvePd4web() {
  const fromEnv = process.env.PD4WEB_BIN;
  if (fromEnv) return fromEnv;

  const local = path.join(ROOT, ".pd4web-venv/bin/pd4web");
  if (fs.existsSync(local)) return local;

  return "pd4web";
}

/**
 * Reject a bundle that would not work once served from an arbitrary folder.
 * These are cheap checks against exactly the ways past bundles broke.
 */
function verifyBundle(webPatchDir, slug) {
  const problems = [];
  const loaderPath = path.join(webPatchDir, "pd4web.js");

  if (!fs.existsSync(loaderPath)) {
    return [`${slug}: pd4web.js não foi gerado.`];
  }

  const loader = fs.readFileSync(loaderPath, "utf8");

  if (!/export\s+default/.test(loader)) {
    problems.push(
      `${slug}: pd4web.js não é um módulo ES. A flag --export-es6-module não pegou — ` +
        `o app importa esse arquivo com import() dinâmico e vai quebrar.`,
    );
  }

  // Any literal path here means the bundle only works from the folder it was
  // built in. Everything must go through locateFile().
  const hardcoded = loader.match(/addModule\(\s*"/);
  if (hardcoded) {
    problems.push(
      `${slug}: pd4web.js chama addModule() com um caminho literal em vez de locateFile(). ` +
        `O bundle não seria realocável.`,
    );
  }

  for (const required of ["pd4web.data", "pd4web.wasm"]) {
    if (!fs.existsSync(path.join(webPatchDir, required))) {
      problems.push(`${slug}: faltou ${required} na saída da compilação.`);
    }
  }

  const dataBytes = fs.statSync(path.join(webPatchDir, "pd4web.data")).size;
  if (dataBytes > MAX_DATA_BYTES) {
    problems.push(
      `${slug}: pd4web.data tem ${(dataBytes / 1048576).toFixed(1)} MB, acima do limite de ` +
        `${MAX_DATA_BYTES / 1048576} MB. Reduza os áudios embarcados.`,
    );
  }

  const wasmBytes = fs.statSync(path.join(webPatchDir, "pd4web.wasm")).size;
  if (wasmBytes > MAX_WASM_BYTES) {
    problems.push(
      `${slug}: pd4web.wasm tem ${(wasmBytes / 1048576).toFixed(1)} MB, acima do limite de ` +
        `${MAX_WASM_BYTES / 1048576} MB.`,
    );
  }

  const threadsPath = path.join(webPatchDir, "pd4web.threads.js");
  if (fs.existsSync(threadsPath) && fs.existsSync(SHARED_THREADS)) {
    const built = fs.readFileSync(threadsPath);
    const shared = fs.readFileSync(SHARED_THREADS);
    if (!built.equals(shared)) {
      problems.push(
        `${slug}: pd4web.threads.js mudou em relação a public/pd4webShared/pd4web.threads.js. ` +
          `Esse arquivo é servido globalmente em layout.tsx — atualize o compartilhado antes de seguir.`,
      );
    }
  }

  return problems;
}

/**
 * Store the wasm under its own hash and return that hash.
 *
 * Patches built from the same externals produce the same runtime, so they end up
 * sharing a single file instead of shipping ~2.8 MB each. A patch that needs a
 * different external simply gets its own directory — nothing breaks, and the
 * browser cache stays valid because the URL changes with the content.
 */
function installRuntime(wasmPath) {
  const bytes = fs.readFileSync(wasmPath);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const target = path.join(RUNTIME_DIR, hash, "pd4web.wasm");

  if (fs.existsSync(target)) return { hash, reused: true };

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return { hash, reused: false };
}

/**
 * Install a bundle that was compiled elsewhere, for patches that the current
 * Pd4Web cannot rebuild yet.
 *
 * `paraisoGaia43` is the reason this exists: Pd4Web 3.3 accepts only one graph
 * in a main patch and that patch has more than one, so recompiling it would mean
 * rearranging someone's artwork. The already-working bundle keeps shipping while
 * the manifest records exactly what has to change for it to build again.
 */
function installPrebuilt(slug, manifest) {
  const from = manifest.build?.prebuiltFrom ?? slug;
  const sourceDir = path.join(ROOT, "public", from);

  for (const file of ["pd4web.js", "pd4web.data", "pd4web.wasm"]) {
    if (!fs.existsSync(path.join(sourceDir, file))) {
      throw new Error(
        `${slug}: build.prebuilt está ligado mas public/${from}/${file} não existe.`,
      );
    }
  }

  const problems = verifyBundle(sourceDir, slug);
  if (problems.length) {
    for (const problem of problems) console.error(`erro: ${problem}`);
    throw new Error(`${slug}: o bundle pré-compilado não passou na verificação.`);
  }

  const runtime = installRuntime(path.join(sourceDir, "pd4web.wasm"));

  const outDir = path.join(OUTPUT_ROOT, slug);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of ["pd4web.js", "pd4web.data"]) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(outDir, file));
  }

  const dataBytes = fs.statSync(path.join(outDir, "pd4web.data")).size;
  fs.writeFileSync(
    path.join(outDir, "build-info.json"),
    `${JSON.stringify(
      {
        slug,
        runtime: runtime.hash,
        initialMemory: manifest.build?.initialMemory ?? 64,
        dataBytes,
        prebuilt: true,
        prebuiltFrom: from,
        prebuiltReason: manifest.build?.prebuiltReason ?? null,
      },
      null,
      2,
    )}\n`,
  );

  return { slug, seconds: "0.0", runtime, dataBytes, prebuilt: true };
}

/**
 * Turn graph-on-parent off so a patch with more than one graph can compile.
 *
 * pd4web 3.3 refuses a main patch containing more than one graph, which is what
 * kept paraisoGaia43 on the prebuilt escape hatch. The graphs in question are
 * `visual03~`, an oscilloscope-style array display, and the main canvas itself.
 *
 * Graph-on-parent is a display property: it decides whether a subpatch draws its
 * contents on the parent canvas. The web bundle is compiled with --nogui and
 * renders no Pd interface at all, so the flag has no effect on what anyone hears.
 * The arrays, the objects and the connections are untouched — only the seventh
 * field of `#X coords` changes, from 1 or 2 to 0.
 *
 * This runs on the workspace copy, never on patches/. The musician's file keeps
 * its graph-on-parent, because that is how they see their instrument in Pd, and
 * nothing about their editing experience changes.
 *
 * It only acts when a patch actually has more than one graph. Patches with one or
 * none compile as they always did and keep byte-identical bundles, so enabling
 * this does not silently rebuild everything.
 */
const COORDS_WITH_GOP = /^(#X coords(?: [-\d.]+){6}) ([12])\b/;

function findGraphs(dir) {
  const found = [];
  const libsDir = path.join(dir, "Libs");
  const files = [
    path.join(dir, "main.pd"),
    ...(fs.existsSync(libsDir)
      ? fs
          .readdirSync(libsDir)
          .filter((f) => f.endsWith(".pd"))
          .map((f) => path.join(libsDir, f))
      : []),
  ];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (COORDS_WITH_GOP.test(line)) found.push({ file, index });
    });
  }
  return found;
}

function flattenGraphs(dir, slug) {
  const graphs = findGraphs(dir);
  if (graphs.length <= 1) return 0;

  const byFile = new Map();
  for (const graph of graphs) {
    if (!byFile.has(graph.file)) byFile.set(graph.file, []);
    byFile.get(graph.file).push(graph.index);
  }

  for (const [file, indexes] of byFile) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (const index of indexes) {
      lines[index] = lines[index].replace(COORDS_WITH_GOP, "$1 0");
    }
    fs.writeFileSync(file, lines.join("\n"));
  }

  console.log(
    `  ${slug}: ${graphs.length} graph-on-parent desligados na cópia de compilação ` +
      `(${[...byFile.keys()].map((f) => path.basename(f)).join(", ")}) — ` +
      `pd4web aceita só um graph por patch principal; é ajuste visual, não sonoro, ` +
      `e patches/ não foi tocado.`,
  );
  return graphs.length;
}

function buildPatch(slug, pd4webBin) {
  const sourceDir = path.join(ROOT, "patches", slug);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(sourceDir, "patch.json"), "utf8"),
  );

  if (manifest.build?.prebuilt) {
    console.log(
      `\n${slug}: reaproveitando bundle já compilado — ${manifest.build.prebuiltReason ?? "sem motivo declarado"}`,
    );
    return installPrebuilt(slug, manifest);
  }

  // Every patch is compiled from the *same* absolute paths, with the same file
  // name, on purpose. Pd4Web embeds the build directory and the project name in
  // the wasm, so building each patch in its own folder produces a byte-different
  // runtime even when the compiled code is identical — which defeats sharing the
  // runtime between patches. Copying into one fixed workspace removes that.
  const workDir = path.join(ROOT, WORKSPACE_NAME, "src");
  const compileOutDir = path.join(ROOT, WORKSPACE_NAME, "out");
  fs.rmSync(path.join(ROOT, WORKSPACE_NAME), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(workDir), { recursive: true });
  fs.cpSync(sourceDir, workDir, { recursive: true });
  fs.rmSync(path.join(workDir, "patch.json"), { force: true });

  flattenGraphs(workDir, slug);

  const memory = String(manifest.build?.initialMemory ?? 64);

  const args = [
    "main.pd",
    "-m",
    memory,
    "--export-es6-module",
    "--nogui",
    "--failfast",
    "-o",
    compileOutDir,
  ];
  if (manifest.build?.patchZoom) {
    args.push("-z", String(manifest.build.patchZoom));
  }

  const started = Date.now();
  execFileSync(pd4webBin, args, {
    cwd: workDir,
    stdio: "inherit",
    // Pure Data stamps __DATE__/__TIME__ into the binary, which was the last
    // thing making two otherwise identical runtimes differ — the wasm for
    // bubble1 and thunder4 matched byte for byte except for the build clock.
    // Clang honours SOURCE_DATE_EPOCH for those macros, so pinning it lets
    // patches with the same object set share a single runtime file.
    env: { ...process.env, SOURCE_DATE_EPOCH: String(SOURCE_DATE_EPOCH) },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  const scratch = path.join(ROOT, WORKSPACE_NAME);
  const webPatch = path.join(compileOutDir, "WebPatch");
  const problems = verifyBundle(webPatch, slug);
  if (problems.length) {
    for (const problem of problems) console.error(`erro: ${problem}`);
    throw new Error(`${slug}: o bundle gerado não passou na verificação.`);
  }

  const runtime = installRuntime(path.join(webPatch, "pd4web.wasm"));

  const outDir = path.join(OUTPUT_ROOT, slug);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of ["pd4web.js", "pd4web.data"]) {
    fs.copyFileSync(path.join(webPatch, file), path.join(outDir, file));
  }

  const dataBytes = fs.statSync(path.join(outDir, "pd4web.data")).size;
  fs.writeFileSync(
    path.join(outDir, "build-info.json"),
    `${JSON.stringify(
      {
        slug,
        runtime: runtime.hash,
        initialMemory: Number(memory),
        dataBytes,
        pd4webVersion: pd4webVersion(pd4webBin),
      },
      null,
      2,
    )}\n`,
  );

  fs.rmSync(scratch, { recursive: true, force: true });

  return { slug, seconds, runtime, dataBytes };
}

let cachedVersion = null;
function pd4webVersion(bin) {
  if (cachedVersion) return cachedVersion;
  cachedVersion = execFileSync(bin, ["--version"], { encoding: "utf8" }).trim();
  return cachedVersion;
}

function main() {
  const args = process.argv.slice(2);
  const slugs = args.includes("--all")
    ? listPatchSlugs()
    : args.filter((arg) => !arg.startsWith("--"));

  if (slugs.length === 0) {
    console.error("Usage: node scripts/build-patch.mjs <slug> [...] | --all");
    process.exit(1);
  }

  const { errors } = loadPatches({ slugs });
  if (errors.length) {
    for (const error of errors) console.error(`erro: ${error}`);
    console.error("\nCorrija os problemas acima antes de compilar.");
    process.exit(1);
  }

  const pd4webBin = resolvePd4web();
  console.log(`pd4web: ${pd4webVersion(pd4webBin)}\n`);

  const results = [];
  for (const slug of slugs) {
    results.push(buildPatch(slug, pd4webBin));
  }

  console.log("\nResumo:");
  for (const result of results) {
    console.log(
      `  ${result.slug}: ${result.prebuilt ? "não recompilado" : `${result.seconds}s`} · ` +
        `data ${(result.dataBytes / 1024).toFixed(0)} KB · ` +
        `runtime ${result.runtime.hash}${result.runtime.reused ? " (compartilhado)" : " (novo)"}`,
    );
  }

  const runtimes = new Set(results.map((result) => result.runtime.hash));
  console.log(
    `\n${runtimes.size} runtime(s) wasm para ${results.length} patch(es).`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
