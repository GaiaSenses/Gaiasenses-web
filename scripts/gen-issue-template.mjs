#!/usr/bin/env node
/**
 * Generate the "new patch" issue form.
 *
 * The animation dropdown is generated from `AvailableCompositionNames` so a
 * musician cannot pick one that does not exist — the same union that makes a bad
 * name a compile error also drives the form they fill in.
 *
 * Usage:
 *   node scripts/gen-issue-template.mjs           # write
 *   node scripts/gen-issue-template.mjs --check   # fail if stale
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readCompositionNames } from "./patch-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, ".github/ISSUE_TEMPLATE/novo-patch.yml");

function render() {
  const compositions = readCompositionNames().sort();
  const options = ["nenhuma (é o som do globo)", ...compositions]
    .map((name) => `        - ${name}`)
    .join("\n");

  return `# GERADO por scripts/gen-issue-template.mjs — não edite à mão.
name: 🎵 Enviar um patch novo
description: Envie uma composição em Pure Data para virar som no GaiaSenses.
title: "[patch] "
labels: ["novo-patch"]
body:
  - type: markdown
    attributes:
      value: |
        Preencha os campos abaixo. Você **não precisa saber programar** nem
        instalar nada além do Pure Data.

        Se for a sua primeira vez, leia antes o
        [guia do músico](../blob/main/docs/musico/README.md) — são cinco minutos
        e evita quase todos os erros comuns.

  - type: input
    id: slug
    attributes:
      label: Nome curto da peça
      description: Vira o nome da pasta. Só letras minúsculas, números e hífen.
      placeholder: trovao-noturno
    validations:
      required: true

  - type: input
    id: label
    attributes:
      label: Nome de exibição
      description: É o que aparece na tela do GaiaSenses.
      placeholder: Trovão Noturno
    validations:
      required: true

  - type: input
    id: author
    attributes:
      label: Autoria
      description: Como você quer ser creditado.
    validations:
      required: true

  - type: dropdown
    id: composition
    attributes:
      label: Toca junto com qual animação?
      description: Escolha "nenhuma" se a peça é a paisagem sonora do globo.
      options:
${options}
    validations:
      required: true

  - type: dropdown
    id: memory
    attributes:
      label: Memória
      description: 64 MB serve para quase tudo. Suba se a peça tem muitas vozes ou samples grandes.
      options:
        - "32"
        - "64"
        - "128"
        - "256"
        - "512"
      default: 1

  - type: textarea
    id: channels
    attributes:
      label: Quais dados a sua peça escuta?
      description: |
        Liste os objetos \`[r gaia.*]\` que você usou. Deixe em branco se a peça
        não usa dado nenhum. A lista completa está no
        [vocabulário](../blob/main/docs/musico/vocabulario.md).
      placeholder: |
        gaia.temp
        gaia.wind.speed
      render: text

  - type: input
    id: license
    attributes:
      label: Licença
      value: CC-BY-4.0

  - type: textarea
    id: notes
    attributes:
      label: Algo mais que devamos saber?
      description: Intenção da peça, referências, cuidados de volume, o que for útil.
`;
}

function main() {
  const check = process.argv.includes("--check");
  const next = render();
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf8") : "";

  if (check) {
    if (next !== current) {
      console.error(
        "O formulário de issue está desatualizado em relação às animações. " +
          "Rode `npm run patches:codegen`.",
      );
      process.exit(1);
    }
    console.log("Formulário de issue está em dia.");
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, next);
  console.log(`${path.relative(ROOT, OUTPUT)} atualizado.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
