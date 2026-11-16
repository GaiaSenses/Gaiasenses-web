/**
 * Contrato do job diário de push (lib/push/deliver.ts), com banco e serviço de
 * push falsos. Cada caso é um modo de falha que já aconteceu ou que a análise
 * de 16/11/2026 apontou: erro permanente reenviado para sempre, envio duplicado
 * por execução repetida, laço sequencial que não escala.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { deliverDue, type DueRow, type PushSender, type PushStore } from "@/lib/push/deliver";
import { MAX_PERMANENT_FAILURES } from "@/lib/push/messages";

const AGORA = new Date("2026-11-16T12:00:00Z");

function linha(id: string, extra: Partial<DueRow> = {}): DueRow {
  return {
    user_id: id,
    frequency: "Daily",
    subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, keys: { p256dh: "p", auth: "a" } },
    locale: "pt",
    fail_count: 0,
    ...extra,
  };
}

/** Banco em memória que registra cada chamada. */
function storeFalso(linhas: DueRow[]) {
  const chamadas = {
    sent: [] as { id: string; next: string }[],
    failed: [] as { id: string; status: number | null; count: number }[],
    removed: [] as string[],
  };
  const store: PushStore = {
    async claimDue() {
      return linhas;
    },
    async markSent(id, next) {
      chamadas.sent.push({ id, next: next.toISOString() });
    },
    async markFailed(id, status, count) {
      chamadas.failed.push({ id, status, count });
    },
    async remove(id) {
      chamadas.removed.push(id);
    },
  };
  return { store, chamadas };
}

function erroHttp(statusCode: number) {
  return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
}

describe("deliverDue", () => {
  test("envia a quem está devendo e reagenda para o dia seguinte", async () => {
    const { store, chamadas } = storeFalso([linha("a"), linha("b", { frequency: "Weekly" })]);
    const enviados: string[] = [];
    const send: PushSender = async (sub, payload) => {
      enviados.push(sub.endpoint);
      const p = JSON.parse(payload);
      assert.equal(p.url, "/pt/map3");
      assert.equal(p.title, "GaiaSenses");
    };

    const resumo = await deliverDue({ store, send, now: AGORA });

    assert.deepEqual(resumo, { due: 2, sent: 2, removed: 0, retryLater: 0, failed: 0 });
    assert.equal(enviados.length, 2);
    assert.deepEqual(
      chamadas.sent.map((s) => s.next),
      ["2026-11-17T03:00:00.000Z", "2026-11-23T03:00:00.000Z"],
    );
  });

  test("o texto e o link seguem o idioma da inscrição", async () => {
    const { store } = storeFalso([linha("en", { locale: "en" }), linha("velho", { locale: null })]);
    const urls: string[] = [];
    await deliverDue({
      store,
      send: async (_s, payload) => {
        urls.push(JSON.parse(payload).url);
      },
      now: AGORA,
    });
    // Linha sem locale (gravada antes da migração) cai no português.
    assert.deepEqual(urls, ["/en/map3", "/pt/map3"]);
  });

  test("404/410 apagam a linha na hora", async () => {
    const { store, chamadas } = storeFalso([linha("a"), linha("b")]);
    const resumo = await deliverDue({
      store,
      send: async (sub) => {
        throw erroHttp(sub.endpoint.endsWith("/a") ? 410 : 404);
      },
      now: AGORA,
    });
    assert.equal(resumo.removed, 2);
    assert.deepEqual(chamadas.removed, ["a", "b"]);
    assert.equal(chamadas.sent.length, 0);
  });

  /**
   * Antes, só 404/410 tiravam a linha. Um 403 (par VAPID diferente do usado na
   * inscrição) voltava todo dia, para sempre, sem registro em lugar nenhum.
   */
  test("erro permanente é registrado e apaga só depois do limite", async () => {
    const abaixo = MAX_PERMANENT_FAILURES - 2; // próxima falha ainda não atinge o limite
    const { store, chamadas } = storeFalso([
      linha("nova", { fail_count: abaixo }),
      linha("no-limite", { fail_count: MAX_PERMANENT_FAILURES - 1 }),
    ]);
    const resumo = await deliverDue({
      store,
      send: async () => {
        throw erroHttp(403);
      },
      now: AGORA,
    });

    assert.equal(resumo.retryLater, 1);
    assert.equal(resumo.removed, 1);
    assert.deepEqual(chamadas.failed, [{ id: "nova", status: 403, count: abaixo + 1 }]);
    assert.deepEqual(chamadas.removed, ["no-limite"]);
  });

  test("erro temporário nunca apaga, só registra e tenta amanhã", async () => {
    const { store, chamadas } = storeFalso([linha("a", { fail_count: 50 })]);
    const resumo = await deliverDue({
      store,
      send: async () => {
        throw erroHttp(503);
      },
      now: AGORA,
    });
    assert.equal(resumo.retryLater, 1);
    assert.equal(chamadas.removed.length, 0);
    assert.deepEqual(chamadas.failed, [{ id: "a", status: 503, count: 51 }]);
  });

  test("erro de rede sem status conta como temporário", async () => {
    const { store, chamadas } = storeFalso([linha("a")]);
    await deliverDue({
      store,
      send: async () => {
        throw new Error("ECONNRESET");
      },
      now: AGORA,
    });
    assert.deepEqual(chamadas.failed, [{ id: "a", status: null, count: 1 }]);
  });

  test("frequência desconhecida não envia nem apaga", async () => {
    const { store, chamadas } = storeFalso([linha("a", { frequency: "Diária" })]);
    let enviou = false;
    const resumo = await deliverDue({
      store,
      send: async () => {
        enviou = true;
      },
      now: AGORA,
    });
    assert.equal(enviou, false);
    assert.equal(resumo.failed, 1);
    assert.equal(chamadas.removed.length, 0);
  });

  test("falha ao reagendar não derruba o lote", async () => {
    const { store } = storeFalso([linha("a"), linha("b")]);
    store.markSent = async (id) => {
      if (id === "a") throw new Error("banco fora");
    };
    const resumo = await deliverDue({ store, send: async () => {}, now: AGORA });
    assert.equal(resumo.sent, 1);
    assert.equal(resumo.failed, 1);
  });

  test("envia em paralelo, respeitando o limite de concorrência", async () => {
    const linhas = Array.from({ length: 25 }, (_, i) => linha(String(i)));
    const { store } = storeFalso(linhas);
    let emVoo = 0;
    let pico = 0;
    const send: PushSender = async () => {
      emVoo++;
      pico = Math.max(pico, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo--;
    };

    const resumo = await deliverDue({ store, send, now: AGORA, concurrency: 10 });

    assert.equal(resumo.sent, 25);
    assert.equal(pico, 10);
  });

  /**
   * A reserva atômica é do banco (claim_due_push_subscriptions, com `for update
   * skip locked`). O contrato do lado do app: o job só processa o que o
   * claimDue devolveu — uma segunda execução simultânea que não recebe linhas
   * não envia nada.
   */
  test("execução que não reservou linhas não envia nada", async () => {
    const { store } = storeFalso([]);
    let enviou = false;
    const resumo = await deliverDue({
      store,
      send: async () => {
        enviou = true;
      },
      now: AGORA,
    });
    assert.equal(enviou, false);
    assert.deepEqual(resumo, { due: 0, sent: 0, removed: 0, retryLater: 0, failed: 0 });
  });
});
