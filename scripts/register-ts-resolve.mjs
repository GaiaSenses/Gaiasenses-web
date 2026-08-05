// Registra o hook de resolução. Uso: node --import ./scripts/register-ts-resolve.mjs --test ...
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-resolve-hook.mjs", pathToFileURL("./scripts/"));
