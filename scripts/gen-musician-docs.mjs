#!/usr/bin/env node
/**
 * Generate the musician-facing vocabulary reference from the vocabulary itself.
 *
 * Hand-written documentation of a list like this drifts the moment someone adds
 * a channel. Generating it means the page a musician reads is always the page
 * the code actually implements.
 *
 * Usage:
 *   node scripts/gen-musician-docs.mjs           # write
 *   node scripts/gen-musician-docs.mjs --check   # fail if stale
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "docs/musico/vocabulario.md");

const vocabulary = JSON.parse(
  fs.readFileSync(path.join(ROOT, "lib/gaia-vocabulary.json"), "utf8"),
);
const events = JSON.parse(
  fs.readFileSync(path.join(ROOT, "lib/gaia-composition-events.json"), "utf8"),
);

const SOURCE_TITLES = {
  map: "Do globo",
  weather: "Do clima do lugar para onde o globo aponta",
  sensor: "Do sensor Bolota (só quando ele está conectado)",
};

const SOURCE_ORDER = ["map", "weather", "sensor"];

function formatRange(channel) {
  if (!channel.range) return channel.unit ?? "";
  const [min, max] = channel.range;
  return `${min} a ${max}${channel.unit ? ` ${channel.unit}` : ""}`;
}

function renderChannelTable(channels) {
  const rows = channels.map((channel) => {
    const object =
      channel.kind === "list"
        ? `[r ${channel.id}]`
        : `[r ${channel.id}]`;
    const aliases = channel.aliases.length
      ? channel.aliases.map((alias) => `\`${alias}\``).join(", ")
      : "—";
    return `| \`${object}\` | ${channel.label} | ${formatRange(channel)} | ${aliases} |`;
  });

  return [
    "| Coloque no patch | O que chega | Faixa de valores | Nomes antigos aceitos |",
    "|---|---|---|---|",
    ...rows,
  ].join("\n");
}

function render() {
  const inbound = vocabulary.channels.filter(
    (channel) => channel.direction === "in",
  );
  const outbound = vocabulary.channels.filter(
    (channel) => channel.direction === "out",
  );

  const sections = SOURCE_ORDER.map((source) => {
    const channels = inbound.filter((channel) => channel.source === source);
    if (channels.length === 0) return null;

    const notes = channels
      .filter((channel) => channel.help)
      .map((channel) => `- \`${channel.id}\` — ${channel.help}`)
      .join("\n");

    return [
      `### ${SOURCE_TITLES[source]}`,
      "",
      renderChannelTable(channels),
      notes ? `\n${notes}` : "",
    ].join("\n");
  }).filter(Boolean);

  const outboundSection = outbound
    .map((channel) =>
      [
        `### \`[s ${channel.id}]\` — ${channel.label}`,
        "",
        channel.help ?? "",
      ].join("\n"),
    )
    .join("\n\n");

  const eventSections = Object.entries(events.compositions)
    .map(([composition, contract]) => {
      const emits = (contract.emits ?? []).map(
        (event) =>
          `- \`[r ${event.name}]\` — ${event.label}${event.help ? `. ${event.help}` : ""}`,
      );
      const listens = (contract.listensTo ?? []).map(
        (event) =>
          `- \`[s ${event.name}]\` — ${event.label}${event.help ? `. ${event.help}` : ""}`,
      );
      if (emits.length === 0 && listens.length === 0) {
        return `### ${composition}\n\n${contract.note ?? "Não emite eventos próprios."}`;
      }
      return [`### ${composition}`, "", ...emits, ...listens]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return `<!-- GERADO por scripts/gen-musician-docs.mjs — não edite à mão. -->
# Vocabulário GaiaSenses

Esta é a lista completa de dados que o seu patch pode receber e enviar.

**Como usar:** coloque no seu patch um objeto \`[r nome-do-canal]\`. Só isso. Não é
preciso avisar ninguém nem editar nenhum arquivo de configuração — quando você
enviar o patch, o sistema lê os objetos que você usou e liga tudo sozinho.

Se você escrever um nome que não existe nesta lista, o objeto simplesmente nunca
recebe nada. Confira a grafia com atenção, inclusive maiúsculas e minúsculas.

---

## Dados que o seu patch pode receber

${sections.join("\n\n")}

---

## O seu patch também pode falar com o site

${outboundSection}

---

## Eventos das animações

Quando o seu patch toca junto com uma animação, ele pode escutar o que a animação
está fazendo. Estes nomes pertencem à animação e valem para qualquer patch que
toque com ela.

${eventSections}

---

## Quer um dado que não está aqui?

Abra uma issue no repositório dizendo qual dado e para quê. Acrescentar um canal
novo é trabalho de programação e leva alguns dias — mas depois de pronto ele fica
disponível para todo mundo, para sempre.
`;
}

function main() {
  const check = process.argv.includes("--check");
  const next = render();
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf8") : "";

  if (check) {
    if (next !== current) {
      console.error(
        "docs/musico/vocabulario.md está desatualizado. Rode `npm run patches:docs`.",
      );
      process.exit(1);
    }
    console.log("Documentação do vocabulário está em dia.");
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, next);
  console.log(`${path.relative(ROOT, OUTPUT)} atualizado.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
