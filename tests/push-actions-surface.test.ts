/**
 * Trava da fronteira de segurança do push (F-SEC-01).
 *
 * Todo export de um arquivo "use server" importado por um componente client
 * vira um endpoint HTTP público. Era assim que o envio em massa
 * (sendNotification) ficava alcançável sem o CRON_SECRET: o ID da action estava
 * no JS de /pt/map3, verificado em produção em 16/11/2026.
 *
 * Este teste lê o código-fonte em vez de importá-lo, para pegar a regressão
 * mesmo em arquivos que nem o teste nem a aplicação importam ainda.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PASTAS = ["app", "components", "lib", "hooks"];

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(nome)) out.push(p);
  }
  return out;
}

/** Arquivos cuja primeira instrução é a diretiva "use server". */
function modulosUseServer(): string[] {
  return PASTAS.flatMap((d) => arquivos(join(ROOT, d))).filter((f) => {
    const semComentarios = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .trimStart();
    return /^["']use server["']/.test(semComentarios);
  });
}

/** Nomes exportados como valor (ignora `export type`). */
function exportsDeValor(src: string): string[] {
  const nomes = new Set<string>();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) {
    nomes.add(m[1]);
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const parte of m[1].split(",")) {
      const p = parte.trim();
      if (!p || p.startsWith("type ")) continue;
      nomes.add(p.split(/\s+as\s+/).pop()!.trim());
    }
  }
  if (/export\s+default/.test(src)) nomes.add("default");
  return [...nomes];
}

describe("superfície de Server Actions do push", () => {
  test("lib/push/actions.ts expõe só inscrever, consultar e cancelar", () => {
    const src = readFileSync(join(ROOT, "lib/push/actions.ts"), "utf8");
    assert.deepEqual(exportsDeValor(src).sort(), ["getSubscriptionStatus", "subscribeUser", "unsubscribeUser"]);
  });

  test("nenhum módulo \"use server\" exporta ou importa o envio em massa", () => {
    const modulos = modulosUseServer();
    assert.ok(modulos.length > 0, "nenhum módulo \"use server\" encontrado: o teste perdeu o alvo");

    for (const f of modulos) {
      const src = readFileSync(f, "utf8");
      const nome = relative(ROOT, f);
      const exp = exportsDeValor(src);

      for (const proibido of ["sendNotification", "deliverDue", "sendReminder", "createSupabaseStore"]) {
        assert.ok(!exp.includes(proibido), `${nome} exporta ${proibido} como Server Action pública`);
      }
      assert.ok(
        !/from\s+["'][^"']*push\/deliver["']/.test(src),
        `${nome} importa lib/push/deliver: o envio em massa não pode estar ao alcance de uma action`,
      );
    }
  });

  test("o envio em massa só é chamado pela rota protegida do cron", () => {
    const chamadores = PASTAS.flatMap((d) => arquivos(join(ROOT, d)))
      .filter((f) => /deliverDue\s*\(/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f))
      .filter((f) => f !== join("lib", "push", "deliver.ts"));
    assert.deepEqual(chamadores, [join("app", "api", "notifications", "route.ts")]);
  });

  test("módulos com credenciais são server-only", () => {
    for (const f of ["lib/supabase-admin.ts", "lib/push/server.ts"]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      assert.match(src, /^import\s+["']server-only["'];/m, `${f} precisa de import "server-only"`);
    }
  });
});
