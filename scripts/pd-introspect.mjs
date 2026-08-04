#!/usr/bin/env node
/**
 * Read a Pure Data project and report what it listens to and what it emits.
 *
 * This is what makes the binding automatic. Instead of a human declaring
 * `latitudeReceiver: "latitude"` in TypeScript — and silently getting it wrong,
 * as happened with `input_co2` — the pipeline scans the patch itself and wires
 * whatever `gaia.*` receivers it finds.
 *
 * The `.pd` format is plain text. Objects look like:
 *
 *   #X obj -2779 -43 r latitude;
 *   #X obj -2871 126 s output;
 *
 * Records are terminated by an unescaped `;` and may span several lines, since
 * Pd wraps long lines. Subpatches live in the same file, so a flat scan reaches
 * them; abstractions live in `Libs/` and are scanned as separate files.
 *
 * Usage:
 *   node scripts/pd-introspect.mjs <patchDir>            # human-readable report
 *   node scripts/pd-introspect.mjs <patchDir> --json     # machine-readable
 */

import fs from "node:fs";
import path from "node:path";

const RECEIVE_CLASSES = new Set(["r", "receive", "r~", "receive~"]);
const SEND_CLASSES = new Set(["s", "send", "s~", "send~"]);

/**
 * Split a patch into logical records.
 *
 * Pd escapes semicolons inside data as `\;`, so only unescaped ones terminate a
 * record. Newlines inside a record are pure line-wrapping and collapse to spaces.
 */
function toRecords(source) {
  return source
    .replace(/\r\n/g, "\n")
    .split(/(?<!\\);/)
    .map((record) => record.replace(/\n/g, " ").trim())
    .filter(Boolean);
}

/** Strip Pd's backslash escapes so names compare correctly. */
function unescapeAtom(atom) {
  return atom.replace(/\\(.)/g, "$1");
}

/**
 * Names containing `$` are instance-local (e.g. `[r voz1Ativa_$0]`) and can
 * never be addressed from outside the patch, so they are not part of the contract.
 */
function isAddressable(name) {
  return Boolean(name) && !name.includes("$");
}

function scanFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const receives = new Set();
  const sends = new Set();
  const objectClasses = new Set();
  const declares = [];

  for (const record of toRecords(source)) {
    if (record.startsWith("#X declare")) {
      declares.push(record.slice("#X declare".length).trim());
      continue;
    }

    // "#X obj <x> <y> <class> <args...>"
    const match = record.match(/^#X obj\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(.*)$/);
    if (!match) continue;

    const atoms = match[3].split(/\s+/).map(unescapeAtom);
    const [objectClass, firstArg] = atoms;
    if (!objectClass) continue;

    objectClasses.add(objectClass);

    if (RECEIVE_CLASSES.has(objectClass) && isAddressable(firstArg)) {
      receives.add(firstArg);
    } else if (SEND_CLASSES.has(objectClass) && isAddressable(firstArg)) {
      sends.add(firstArg);
    }
  }

  return { receives, sends, objectClasses, declares };
}

function listPatchFiles(patchDir, mainName = "main.pd") {
  const mainPath = path.join(patchDir, mainName);
  if (!fs.existsSync(mainPath)) {
    throw new Error(`Main patch not found: ${mainPath}`);
  }

  const libsDir = path.join(patchDir, "Libs");
  const libs = fs.existsSync(libsDir)
    ? fs
        .readdirSync(libsDir, { recursive: true })
        .map(String)
        .filter((name) => name.endsWith(".pd"))
        .map((name) => path.join(libsDir, name))
        .sort()
    : [];

  return { mainPath, libs, libsDir, hasLibs: libs.length > 0 };
}

/**
 * Introspect a patch project.
 *
 * `receives`/`sends` are the union across the main patch and every abstraction,
 * because a `[r gaia.temp]` buried in an abstraction is just as reachable.
 * `mainDeclares` stays separate: `[declare -path Libs]` only counts in the main patch.
 */
export function introspectPatch(patchDir, mainName = "main.pd") {
  const { mainPath, libs, hasLibs } = listPatchFiles(patchDir, mainName);

  const main = scanFile(mainPath);
  const receives = new Set(main.receives);
  const sends = new Set(main.sends);
  const objectClasses = new Set(main.objectClasses);

  for (const libPath of libs) {
    const lib = scanFile(libPath);
    lib.receives.forEach((name) => receives.add(name));
    lib.sends.forEach((name) => sends.add(name));
    lib.objectClasses.forEach((name) => objectClasses.add(name));
  }

  const libNames = libs.map((libPath) =>
    path.basename(libPath, ".pd"),
  );

  // Objects written as `Libs/foo` or as a bare `foo` that matches an abstraction.
  const abstractionRefs = [...objectClasses]
    .filter((name) => name.startsWith("Libs/") || libNames.includes(name))
    .map((name) => name.replace(/^Libs\//, ""));

  // `library/object`, e.g. `else/plaits~`. The pattern requires a name on both
  // sides of the slash so the arithmetic objects `[/ ]`, `[/~ ]` are not mistaken
  // for externals.
  const externals = [...objectClasses].filter(
    (name) => /^[\w.-]+\/[\w.~-]+$/.test(name) && !name.startsWith("Libs/"),
  );

  return {
    patchDir,
    mainName,
    files: [mainPath, ...libs],
    receives: [...receives].sort(),
    sends: [...sends].sort(),
    objectClasses: [...objectClasses].sort(),
    abstractionRefs: [...new Set(abstractionRefs)].sort(),
    externals: [...new Set(externals)].sort(),
    libNames: libNames.sort(),
    hasLibs,
    mainDeclares: main.declares,
    declaresLibsPath: main.declares.some((declare) =>
      /-path\s+Libs\b/.test(declare),
    ),
  };
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const patchDir = args.find((arg) => !arg.startsWith("--"));

  if (!patchDir) {
    console.error("Usage: node scripts/pd-introspect.mjs <patchDir> [--json]");
    process.exit(1);
  }

  const report = introspectPatch(patchDir);

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`${patchDir}  (${report.files.length} arquivo(s) .pd)`);
  console.log(`  [declare -path Libs]: ${report.declaresLibsPath ? "sim" : "NÃO"}`);
  console.log(`  recebe : ${report.receives.join(", ") || "(nada)"}`);
  console.log(`  envia  : ${report.sends.join(", ") || "(nada)"}`);
  if (report.externals.length) {
    console.log(`  externals: ${report.externals.join(", ")}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
