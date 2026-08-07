/**
 * Validate the declared animations under `compositions/`.
 *
 * The sibling of scripts/patch-manifest.mjs, and deliberately shaped like it:
 * same reporting, same tone, same rule that a misspelling is an error with a
 * suggestion rather than something that fails silently at runtime.
 *
 * An animation declares what it consumes — `attributes` — and how its audio
 * follows from that. Everything the site needs to mount it is derived from
 * those two. Nothing here reads TypeScript, and nothing here writes it; the
 * registry is generated separately by gen-composition-registry.mjs.
 *
 * Run with: npm run compositions:validate
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSITIONS_DIR = path.join(ROOT, "compositions");
const VOCABULARY = JSON.parse(
  fs.readFileSync(path.join(ROOT, "lib/gaia-composition-attributes.json"), "utf8"),
);

const ATTRIBUTES = VOCABULARY.attributes;
const ALIASES = Object.fromEntries(
  Object.entries(VOCABULARY.aliases).filter(([chave]) => chave !== "$comment"),
);

/** ids são chaves de objeto em TypeScript gerado, e nomes de pasta. */
const ID_PATTERN = /^[a-z][a-zA-Z0-9]{1,39}$/;
const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;

/** Distância de edição, para sugerir a grafia certa em vez de só recusar. */
function editDistance(a, b) {
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(
        linha[j] + 1,
        linha[j - 1] + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      anterior = guardado;
    }
  }

  return linha[b.length];
}

function closestName(alvo, candidatos) {
  let melhor = null;
  let menor = Infinity;

  for (const candidato of candidatos) {
    const distancia = editDistance(alvo.toLowerCase(), candidato.toLowerCase());
    if (distancia < menor) {
      menor = distancia;
      melhor = candidato;
    }
  }

  // Metade do nome é longe demais para ser erro de digitação.
  return menor <= Math.max(2, Math.floor(alvo.length / 2)) ? melhor : null;
}

function canonical(nome) {
  if (nome in ATTRIBUTES) return nome;
  const apelido = ALIASES[nome];
  return apelido && apelido in ATTRIBUTES ? apelido : null;
}

function validateManifest(manifest, slug, errors, warnings, aliasesUsed) {
  const onde = `compositions/${slug}/composition.json`;

  for (const campo of ["id", "label", "attributes", "audio", "thumb"]) {
    if (manifest[campo] === undefined) {
      errors.push(`${onde}: falta o campo obrigatório "${campo}"`);
    }
  }

  if (manifest.id !== undefined && !ID_PATTERN.test(manifest.id)) {
    errors.push(
      `${onde}: id "${manifest.id}" inválido. Use camelCase começando por ` +
        `letra minúscula — vira chave no registro gerado`,
    );
  }

  if (!Array.isArray(manifest.attributes)) {
    if (manifest.attributes !== undefined) {
      errors.push(`${onde}: "attributes" precisa ser uma lista`);
    }
  } else {
    if (manifest.attributes.length === 0) {
      warnings.push(
        `compositions/${slug}: a animação não pede dado nenhum. ` +
          `Funciona, mas ela não vai reagir ao clima`,
      );
    }

    for (const nome of manifest.attributes) {
      const resolvido = canonical(nome);

      if (!resolvido) {
        const sugestao = closestName(nome, Object.keys(ATTRIBUTES));
        errors.push(
          `${onde}: "${nome}" não é um dado disponível` +
            (sugestao ? `. Você quis dizer "${sugestao}"?` : ""),
        );
        continue;
      }

      if (resolvido !== nome) aliasesUsed.push({ used: nome, canonical: resolvido });
    }
  }

  validateAudio(manifest, slug, onde, errors, warnings);
}

function validateAudio(manifest, slug, onde, errors, warnings) {
  const audio = manifest.audio;
  if (!audio || typeof audio !== "object") return;

  if (!["none", "patch", "mp3"].includes(audio.kind)) {
    errors.push(`${onde}: audio.kind precisa ser "none", "patch" ou "mp3"`);
    return;
  }

  if (audio.kind !== "mp3") return;

  const arquivos = [];

  if (audio.file !== undefined) {
    arquivos.push(audio.file);
  } else if (Array.isArray(audio.steps)) {
    if (audio.by === undefined) {
      errors.push(`${onde}: audio com "steps" precisa de "by" dizendo qual dado decide`);
    } else if (!canonical(audio.by)) {
      errors.push(`${onde}: audio.by "${audio.by}" não é um dado disponível`);
    } else if (
      Array.isArray(manifest.attributes) &&
      !manifest.attributes.some((nome) => canonical(nome) === canonical(audio.by))
    ) {
      errors.push(
        `${onde}: audio.by é "${audio.by}", mas ele não está em "attributes" — ` +
          `o dado não seria buscado e a regra escolheria sempre a mesma faixa`,
      );
    }

    // Faixas fora de ordem escolhem o arquivo errado sem erro nenhum: a
    // primeira que couber vence, então uma faixa larga na frente engole as
    // seguintes.
    let anterior = -Infinity;
    for (const [indice, faixa] of audio.steps.entries()) {
      if (faixa.below !== undefined) {
        if (faixa.below <= anterior) {
          errors.push(
            `${onde}: audio.steps[${indice}] tem "below" ${faixa.below}, que não é ` +
              `maior que o anterior (${anterior}). As faixas precisam subir`,
          );
        }
        anterior = faixa.below;
      } else if (indice !== audio.steps.length - 1) {
        errors.push(
          `${onde}: só a última faixa pode omitir "below" — as depois dela ` +
            `nunca seriam alcançadas`,
        );
      }
      if (faixa.file) arquivos.push(faixa.file);
    }

    if (audio.steps.at(-1)?.below !== undefined) {
      warnings.push(
        `compositions/${slug}: a última faixa de áudio tem "below", então ` +
          `valores acima dela ficam sem som. Omita "below" para cobrir o resto`,
      );
    }
  } else {
    errors.push(`${onde}: audio mp3 precisa de "file" ou de "steps"`);
  }

  for (const arquivo of arquivos) {
    if (!fs.existsSync(path.join(ROOT, "public/audios", arquivo))) {
      errors.push(`${onde}: public/audios/${arquivo} não existe`);
    }
  }
}

function validateStructure(slug, manifest, errors) {
  const dir = path.join(COMPOSITIONS_DIR, slug);

  if (!fs.existsSync(path.join(dir, "sketch.js")) && !fs.existsSync(path.join(dir, "sketch.tsx"))) {
    errors.push(`compositions/${slug}: falta sketch.js (ou sketch.tsx)`);
  }

  if (!SLUG_PATTERN.test(slug)) {
    errors.push(
      `compositions/${slug}: nome de pasta inválido. Use minúsculas e hífen`,
    );
  }

  // As miniaturas ficam soltas em public/, como as das animações antigas.
  if (manifest.thumb && !fs.existsSync(path.join(ROOT, "public", manifest.thumb))) {
    errors.push(`compositions/${slug}: public/${manifest.thumb} não existe`);
  }
}

export function readCompositions() {
  if (!fs.existsSync(COMPOSITIONS_DIR)) return [];

  return fs
    .readdirSync(COMPOSITIONS_DIR, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort()
    .map((slug) => {
      const arquivo = path.join(COMPOSITIONS_DIR, slug, "composition.json");
      if (!fs.existsSync(arquivo)) return { slug, manifest: null };
      return { slug, manifest: JSON.parse(fs.readFileSync(arquivo, "utf8")) };
    });
}

function main() {
  const compositions = readCompositions();
  const errors = [];
  const warnings = [];

  if (compositions.length === 0) {
    console.log("Nenhuma animação declarada em compositions/.");
    return;
  }

  const idsVistos = new Map();

  for (const { slug, manifest } of compositions) {
    if (!manifest) {
      errors.push(`compositions/${slug}: falta composition.json`);
      continue;
    }

    const aliasesUsed = [];
    validateManifest(manifest, slug, errors, warnings, aliasesUsed);
    validateStructure(slug, manifest, errors);

    if (manifest.id) {
      const anterior = idsVistos.get(manifest.id);
      if (anterior) {
        errors.push(
          `compositions/${slug}: o id "${manifest.id}" já é usado por ` +
            `compositions/${anterior}`,
        );
      } else {
        idsVistos.set(manifest.id, slug);
      }
    }

    const atributos = Array.isArray(manifest.attributes)
      ? manifest.attributes.map((nome) => canonical(nome) ?? nome)
      : [];

    console.log(
      `✓ compositions/${slug} — ${atributos.join(", ") || "sem dados"}`,
    );
    for (const alias of aliasesUsed) {
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

  console.log(`\n${compositions.length} animação(ões) validada(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
