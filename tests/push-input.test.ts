/**
 * Validação da inscrição, conteúdo das notificações e autenticação do cron.
 * Tudo módulo puro: roda sem rede e sem banco.
 */
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

import { parseEndpoint, parseSubscription, validateSubscribeInput } from "@/lib/push/validation";
import { buildPayload, classifyPushError } from "@/lib/push/messages";
import { isCronAuthorized } from "@/lib/push/cron-auth";

const SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  expirationTime: null,
  keys: { p256dh: "BPk", auth: "xyz" },
};

describe("parseSubscription", () => {
  test("aceita o formato de PushSubscription.toJSON()", () => {
    assert.deepEqual(parseSubscription(SUB), SUB);
  });

  test("descarta campos extras vindos do cliente", () => {
    const limpo = parseSubscription({ ...SUB, admin: true, keys: { ...SUB.keys, x: 1 } });
    assert.deepEqual(limpo, SUB);
  });

  test("recusa endpoint sem https, sem chaves ou malformado", () => {
    for (const ruim of [
      null,
      "texto",
      { ...SUB, endpoint: "http://fcm.googleapis.com/x" },
      { ...SUB, endpoint: "não é url" },
      { ...SUB, endpoint: "https://" + "a".repeat(3000) },
      { endpoint: SUB.endpoint },
      { ...SUB, keys: { p256dh: "", auth: "x" } },
    ]) {
      assert.equal(parseSubscription(ruim), null, JSON.stringify(ruim)?.slice(0, 80));
    }
  });

  /**
   * A confirmação sai na hora da inscrição, para o endpoint que o cliente
   * manda. Endpoint fora dos serviços de push faria o servidor disparar POSTs
   * para um endereço escolhido por qualquer pessoa.
   */
  test("recusa endpoint fora dos serviços de push", () => {
    for (const endpoint of [
      "https://vitima.example/qualquer",
      "https://fcm.googleapis.com.atacante.example/x",
      "https://atacantefcm.googleapis.com/x",
      "https://user:senha@fcm.googleapis.com/fcm/send/abc",
      "https://169.254.169.254/latest/meta-data",
    ]) {
      assert.equal(parseSubscription({ ...SUB, endpoint }), null, endpoint);
    }
  });
});

describe("parseEndpoint", () => {
  test("aceita os serviços de push dos navegadores", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc", // Chrome, Edge, Opera
      "https://updates.push.services.mozilla.com/wpush/v2/abc", // Firefox
      "https://web.push.apple.com/abc", // Safari
      "https://wns2-par02p.notify.windows.com/w/?token=abc", // WNS
    ]) {
      assert.equal(parseEndpoint(endpoint), endpoint);
    }
  });

  test("recusa o que não é string https de serviço de push", () => {
    for (const ruim of [undefined, null, 42, "", "http://fcm.googleapis.com/x", "https://exemplo.com/x"]) {
      assert.equal(parseEndpoint(ruim), null, String(ruim));
    }
  });
});

describe("validateSubscribeInput", () => {
  const ok = { name: " Ana ", email: " ana@exemplo.com ", frequency: "Weekly", locale: "en", subscription: SUB };

  test("normaliza espaços e idioma", () => {
    const r = validateSubscribeInput(ok);
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.value.name, "Ana");
      assert.equal(r.value.email, "ana@exemplo.com");
      assert.equal(r.value.locale, "en");
    }
  });

  test("idioma desconhecido vira português", () => {
    const r = validateSubscribeInput({ ...ok, locale: "fr" });
    assert.ok(r.ok && r.value.locale === "pt");
  });

  /**
   * O formulário traduzia o rótulo ("Diária") para o código no navegador, resto
   * de quando o banco gravava o texto em português. O servidor só aceita código.
   */
  test("frequência precisa ser o código, não o rótulo traduzido", () => {
    assert.deepEqual(validateSubscribeInput({ ...ok, frequency: "Semanal" }), {
      ok: false,
      error: "invalid-frequency",
    });
  });

  test("cada campo inválido tem seu motivo", () => {
    assert.deepEqual(validateSubscribeInput({ ...ok, name: "   " }), { ok: false, error: "invalid-name" });
    assert.deepEqual(validateSubscribeInput({ ...ok, name: "x".repeat(121) }), { ok: false, error: "invalid-name" });
    assert.deepEqual(validateSubscribeInput({ ...ok, email: "a@b" }), { ok: false, error: "invalid-email" });
    assert.deepEqual(validateSubscribeInput({ ...ok, subscription: {} }), {
      ok: false,
      error: "invalid-subscription",
    });
    assert.deepEqual(validateSubscribeInput(undefined), { ok: false, error: "invalid-name" });
  });
});

describe("buildPayload", () => {
  test("confirmação diz a frequência no idioma certo", () => {
    const pt = buildPayload("welcome", "pt", "Weekly");
    const en = buildPayload("welcome", "en", "Daily");
    assert.match(pt.body, /toda semana/);
    assert.match(en.body, /every day/);
    assert.equal(pt.url, "/pt/map3");
    assert.equal(en.url, "/en/map3");
  });

  test("ícone apontado existe no lugar certo e lembrete tem tag fixa", () => {
    const p = buildPayload("reminder", "pt");
    assert.equal(p.icon, "/icon-192.png");
    assert.equal(p.tag, "gaiasenses-reminder");
  });
});

describe("classifyPushError", () => {
  test("separa morto, permanente e temporário", () => {
    assert.equal(classifyPushError(404), "gone");
    assert.equal(classifyPushError(410), "gone");
    for (const s of [400, 403, 413]) assert.equal(classifyPushError(s), "permanent");
    for (const s of [429, 500, 502, 503, null, undefined]) assert.equal(classifyPushError(s), "temporary");
  });
});

describe("isCronAuthorized", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  const req = (auth?: string) =>
    new Request("https://x/api/notifications", auth ? { headers: { authorization: auth } } : {});

  test("sem a variável, recusa tudo (fail closed)", () => {
    delete process.env.CRON_SECRET;
    assert.equal(isCronAuthorized(req("Bearer qualquer")), "not-configured");
  });

  test("só o Bearer exato passa", () => {
    process.env.CRON_SECRET = "s3gredo";
    assert.equal(isCronAuthorized(req("Bearer s3gredo")), "ok");
    assert.equal(isCronAuthorized(req("Bearer s3gred")), "unauthorized");
    assert.equal(isCronAuthorized(req("s3gredo")), "unauthorized");
    assert.equal(isCronAuthorized(req()), "unauthorized");
  });
});
