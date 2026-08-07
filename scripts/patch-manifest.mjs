#!/usr/bin/env node
/**
 * Load, validate and resolve every patch manifest under `patches/`.
 *
 * "Resolve" is the interesting part: the manifest deliberately has no binding
 * block. This module pairs each manifest with the receivers actually found in
 * its `.pd` files and produces the channel map the app consumes:
 *
 *   receivers: { "gaia.lat": "latitude" }   // legacy patch, alias resolved
 *   receivers: { "gaia.temp": "gaia.temp" } // patch using the vocabulary
 *
 * Validation is hand-written rather than schema-driven on purpose: the audience
 * for these errors is a musician, so the messages have to be readable and in
 * Portuguese. `schemas/gaia.patch.schema.json` still exists — it powers editor
 * autocomplete via the `$schema` key — but it is not the runtime validator.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { introspectPatch } from "./pd-introspect.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PATCHES_DIR = path.join(ROOT, "patches");

const vocabulary = JSON.parse(
  fs.readFileSync(path.join(ROOT, "lib/gaia-vocabulary.json"), "utf8"),
);

export const compositionEvents = JSON.parse(
  fs.readFileSync(path.join(ROOT, "lib/gaia-composition-events.json"), "utf8"),
);

const CHANNEL_BY_NAME = new Map();
for (const channel of vocabulary.channels) {
  CHANNEL_BY_NAME.set(channel.id, channel);
  for (const alias of channel.aliases) CHANNEL_BY_NAME.set(alias, channel);
}

const VALID_MOMENTS = new Set(["map", "player"]);
const VALID_MEMORY = new Set([32, 64, 128, 256, 512]);
// camelCase is allowed because the patches that predate this pipeline use it
// (paraisoGaia43); new patches are asked for lowercase-with-hyphens in the tutorial.
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,39}$/;

/**
 * Composition keys are the source of truth for what a patch may pair with.
 *
 * They come from `compositions/*[/]composition.json` — one place, since every
 * animation is declared. This used to also parse a union out of
 * compositions-info.tsx, because half the catalogue was hand-written
 * TypeScript. That half no longer exists.
 */
export function readCompositionNames() {
  const dir = path.join(ROOT, "compositions");
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name, "composition.json"))
    .filter((file) => fs.existsSync(file))
    .map((file) => JSON.parse(fs.readFileSync(file, "utf8")).id)
    .filter(Boolean)
    .sort();
}

/** Levenshtein distance, used to turn a typo into "você quis dizer X?". */
function editDistance(a, b) {
  const rows = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      rows[i][j] =
        b[i - 1] === a[j - 1]
          ? rows[i - 1][j - 1]
          : 1 + Math.min(rows[i - 1][j - 1], rows[i][j - 1], rows[i - 1][j]);
    }
  }
  return rows[b.length][a.length];
}

function closestName(target, candidates) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = editDistance(target, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= 4 ? best : null;
}

export function listPatchSlugs() {
  if (!fs.existsSync(PATCHES_DIR)) return [];
  return fs
    .readdirSync(PATCHES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function validateManifest(manifest, slug, compositionNames, errors) {
  const fail = (message) => errors.push(`patches/${slug}: ${message}`);

  if (manifest.id !== slug) {
    fail(`o campo "id" é "${manifest.id}" mas a pasta se chama "${slug}". Os dois precisam ser iguais.`);
  }
  if (!ID_PATTERN.test(String(manifest.id ?? ""))) {
    fail(`"id" inválido. Use apenas letras, números e hífen (2 a 40 caracteres), começando por letra ou número.`);
  }
  if (!manifest.label || typeof manifest.label !== "string") {
    fail(`falta o campo "label" (o nome que aparece na tela).`);
  }
  if (!manifest.author?.name) {
    fail(`falta "author.name". Toda composição precisa de autoria.`);
  }
  if (!manifest.license) {
    fail(`falta "license". Sugestão: "CC-BY-4.0".`);
  }

  const moments = manifest.activation?.moments;
  if (!Array.isArray(moments) || moments.length === 0) {
    fail(`"activation.moments" precisa listar pelo menos "map" ou "player".`);
  } else {
    for (const moment of moments) {
      if (!VALID_MOMENTS.has(moment)) {
        fail(`"${moment}" não é um momento válido. Use "map" ou "player".`);
      }
    }
  }

  for (const composition of manifest.activation?.compositions ?? []) {
    if (!compositionNames.includes(composition)) {
      const suggestion = closestName(composition, compositionNames);
      fail(
        `a animação "${composition}" não existe.` +
          (suggestion ? ` Você quis dizer "${suggestion}"?` : ""),
      );
    }
  }

  const memory = manifest.build?.initialMemory;
  if (memory !== undefined && !VALID_MEMORY.has(memory)) {
    fail(`"build.initialMemory" precisa ser 32, 64, 128, 256 ou 512 (recebi ${memory}).`);
  }
}

/**
 * Match the receivers found in the patch against the vocabulary.
 *
 * Returns the channel map plus everything a report needs: which legacy aliases
 * were used, and which declared-but-unmatched names exist.
 */
function resolveChannels(introspection) {
  const receivers = {};
  const senders = {};
  const legacyAliases = [];
  const ambiguous = [];

  // A patch may expose more than one name for the same channel — paraisoGaia43
  // has both [r latitude] (fed by the map) and [r lati] (fed by the curves and
  // cloudBubble sketches). Only one can be the app's target, so the winner is
  // picked by declared priority — canonical name first, then aliases in the
  // order they appear in the vocabulary — rather than by set iteration order,
  // which would make the build non-deterministic.
  const pick = (names, direction, target) => {
    for (const channel of vocabulary.channels) {
      if (channel.direction !== direction) continue;

      const candidates = [channel.id, ...channel.aliases].filter((name) =>
        names.includes(name),
      );
      if (candidates.length === 0) continue;

      const [chosen, ...rest] = candidates;
      target[channel.id] = chosen;
      if (chosen !== channel.id) {
        legacyAliases.push({ used: chosen, canonical: channel.id });
      }
      if (rest.length) {
        ambiguous.push({ channel: channel.id, chosen, ignored: rest });
      }
    }
  };

  pick(introspection.receives, "in", receivers);
  pick(introspection.sends, "out", senders);

  return { receivers, senders, legacyAliases, ambiguous };
}

/**
 * Match the patch against the event contract of the animations it is paired with.
 *
 * This is the second half of "no TypeScript edits": `thunder4` reacts to
 * `[r bolt]`, an event `lightningBolts` has always emitted. Because the event
 * belongs to the animation and not to the patch, any future patch for that
 * animation works by listening to the same name.
 */
function resolveCompositionEvents(manifest, introspection) {
  const consumes = [];
  const produces = [];

  for (const composition of manifest.activation?.compositions ?? []) {
    const contract = compositionEvents.compositions[composition];
    if (!contract) continue;

    for (const event of contract.emits ?? []) {
      if (introspection.receives.includes(event.name)) {
        consumes.push({ composition, ...event });
      }
    }
    for (const event of contract.listensTo ?? []) {
      if (introspection.sends.includes(event.name)) {
        produces.push({ composition, ...event });
      }
    }
  }

  return { consumes, produces };
}

/**
 * Catch a misspelled vocabulary name.
 *
 * `[r gaia.temperatura]` is unambiguously an attempt to use the vocabulary, and
 * left alone it would do nothing at all — the exact silent failure this pipeline
 * exists to prevent. Anything in the `gaia.` namespace must therefore be a real
 * channel; names outside it are the musician's own and are none of our business.
 */
function validateVocabularyNames(introspection, slug, errors) {
  const known = [...CHANNEL_BY_NAME.keys()];

  for (const [direction, names] of [
    ["r", introspection.receives],
    ["s", introspection.sends],
  ]) {
    for (const name of names) {
      if (!name.startsWith("gaia.") || CHANNEL_BY_NAME.has(name)) continue;

      const vocabulary = known.filter((candidate) => candidate.startsWith("gaia."));

      // Edit distance alone misses the most common mistake, which is writing the
      // word out in full: "gaia.temperatura" is seven edits from "gaia.temp" but
      // obviously means it. Prefer a prefix match, longest first.
      const byPrefix = vocabulary
        .filter(
          (candidate) =>
            name.startsWith(candidate) || candidate.startsWith(name),
        )
        .sort((a, b) => b.length - a.length)[0];

      const suggestion = byPrefix ?? closestName(name, vocabulary);
      errors.push(
        `patches/${slug}: o objeto [${direction} ${name}] usa um nome do vocabulário que não existe, ` +
          `então nunca receberia nada.` +
          (suggestion ? ` Você quis dizer "${suggestion}"?` : "") +
          ` A lista completa está em docs/musico/vocabulario.md.`,
      );
    }
  }
}

function validatePatchStructure(introspection, slug, errors, warnings) {
  const fail = (message) => errors.push(`patches/${slug}: ${message}`);
  const warn = (message) => warnings.push(`patches/${slug}: ${message}`);

  if (introspection.hasLibs && !introspection.declaresLibsPath) {
    fail(
      `existe uma pasta Libs/ mas o patch principal não tem o objeto [declare -path Libs]. ` +
        `Sem ele o Pd não encontra as abstrações.`,
    );
  }

  // Case matters inside the Pd4Web virtual filesystem and on Linux, but not on
  // macOS — this is the classic "funciona na minha máquina" failure.
  const byLowerCase = new Map(
    introspection.libNames.map((name) => [name.toLowerCase(), name]),
  );
  for (const reference of introspection.abstractionRefs) {
    if (introspection.libNames.includes(reference)) continue;
    const caseMatch = byLowerCase.get(reference.toLowerCase());
    if (caseMatch) {
      fail(
        `o patch usa [${reference}] mas o arquivo se chama "Libs/${caseMatch}.pd". ` +
          `Maiúsculas e minúsculas precisam bater exatamente.`,
      );
    } else {
      warn(`o patch usa [${reference}], que não está em Libs/. Confirme que é um objeto do Pd.`);
    }
  }
}

/** Load every patch, validate it, and resolve its channels. */
export function loadPatches({ slugs } = {}) {
  const compositionNames = readCompositionNames();
  const errors = [];
  const warnings = [];
  const patches = [];
  const seenIds = new Set();

  for (const slug of slugs ?? listPatchSlugs()) {
    const dir = path.join(PATCHES_DIR, slug);
    const manifestPath = path.join(dir, "patch.json");

    if (!fs.existsSync(manifestPath)) {
      errors.push(`patches/${slug}: falta o arquivo patch.json.`);
      continue;
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (error) {
      errors.push(`patches/${slug}/patch.json não é um JSON válido: ${error.message}`);
      continue;
    }

    if (seenIds.has(manifest.id)) {
      errors.push(`patches/${slug}: o id "${manifest.id}" já é usado por outro patch.`);
    }
    seenIds.add(manifest.id);

    validateManifest(manifest, slug, compositionNames, errors);

    let introspection;
    try {
      introspection = introspectPatch(dir);
    } catch (error) {
      errors.push(`patches/${slug}: ${error.message}`);
      continue;
    }

    validatePatchStructure(introspection, slug, errors, warnings);
    validateVocabularyNames(introspection, slug, errors);

    const { receivers, senders, legacyAliases, ambiguous } = resolveChannels(introspection);

    for (const clash of ambiguous) {
      warnings.push(
        `patches/${slug}: o patch tem mais de um receiver para ${clash.channel} ` +
          `(${[clash.chosen, ...clash.ignored].join(", ")}). O app vai enviar para "${clash.chosen}"; ` +
          `os outros só recebem de dentro do patch.`,
      );
    }
    const events = resolveCompositionEvents(manifest, introspection);

    if (
      !manifest.skipReceiverCheck &&
      Object.keys(receivers).length === 0 &&
      Object.keys(senders).length === 0 &&
      events.consumes.length === 0 &&
      events.produces.length === 0
    ) {
      warnings.push(
        `patches/${slug}: o patch não escuta nenhum canal gaia.* nem nenhum evento da animação ` +
          `com que está pareado, então vai tocar sem reagir a nada. Veja docs/musico/vocabulario.md.`,
      );
    }

    patches.push({
      slug,
      dir,
      manifest,
      introspection,
      receivers,
      senders,
      legacyAliases,
      ambiguous,
      events,
    });
  }

  return { patches, errors, warnings, compositionNames };
}

function main() {
  const { patches, errors, warnings } = loadPatches();

  for (const patch of patches) {
    const channels = [
      ...Object.keys(patch.receivers),
      ...Object.keys(patch.senders),
      ...patch.events.consumes.map((event) => `${event.composition}:${event.name}`),
      ...patch.events.produces.map((event) => `${event.composition}:${event.name} (saída)`),
    ];
    console.log(`✓ patches/${patch.slug} — ${channels.join(", ") || "sem canais"}`);
    for (const alias of patch.legacyAliases) {
      console.log(`    nome antigo "${alias.used}" reconhecido como ${alias.canonical}`);
    }
  }

  for (const warning of warnings) console.warn(`aviso: ${warning}`);

  if (errors.length) {
    console.error("");
    for (const error of errors) console.error(`erro: ${error}`);
    console.error(`\n${errors.length} problema(s) encontrado(s).`);
    process.exit(1);
  }

  console.log(`\n${patches.length} patch(es) validado(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
