/**
 * Resolve hook so `node --test` can load the app's TypeScript directly.
 *
 * Two things Next resolves that plain Node ESM does not: imports without a file
 * extension (`./getOpenMeteo`) and the `@/` alias from tsconfig.json. Node 22
 * already strips types on its own, so this hook is the only piece missing — which
 * is why it is 30 lines here instead of a bundler or a test framework.
 *
 * Kept dependency-free on purpose. The project just removed eight unused packages
 * and triaged nineteen advisories; a devDependency added now becomes something to
 * re-triage later, and this does not.
 */
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

function primeiroQueExiste(base, specifier) {
  for (const ext of EXTENSIONS) {
    const caminho = resolvePath(base, specifier + ext);
    if (existsSync(caminho)) return pathToFileURL(caminho).href;
  }
  const indice = resolvePath(base, specifier, "index");
  for (const ext of EXTENSIONS) {
    if (existsSync(indice + ext)) return pathToFileURL(indice + ext).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const temExtensao = /\.[a-z]+$/i.test(specifier);

  if (specifier.startsWith("@/")) {
    // O alias vale sempre, com extensão ou sem. A versão anterior só o tratava
    // quando não havia extensão, então `@/lib/x.json` escapava e o Node saía
    // procurando um pacote chamado `@/lib`.
    //
    // Tentar o caminho literal primeiro e só então adivinhar a extensão cobre
    // os dois casos e mais um: um nome como `x.generated` casa com a regra de
    // "tem extensão" sem ter nenhuma, e resolver só pelo literal o deixaria de
    // fora.
    const relativo = specifier.slice(2);
    const literal = resolvePath(ROOT, relativo);

    if (temExtensao && existsSync(literal)) {
      return nextResolve(pathToFileURL(literal).href, context);
    }

    const encontrado = primeiroQueExiste(ROOT, relativo);
    if (encontrado) return nextResolve(encontrado, context);
  }

  if (specifier.startsWith(".") && !temExtensao && context.parentURL) {
    const base = dirname(fileURLToPath(context.parentURL));
    const encontrado = primeiroQueExiste(base, specifier);
    if (encontrado) return nextResolve(encontrado, context);
  }

  return nextResolve(specifier, context);
}
