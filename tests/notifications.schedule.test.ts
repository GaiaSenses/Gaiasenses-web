/**
 * Contract tests for push scheduling.
 *
 * Like the satellite suite next door, every case here corresponds to a defect
 * that actually shipped. Four of the five subscribers had stopped receiving
 * anything — three frozen since 2026-07-21, one since 2026-06-17 — and nothing
 * in the system was going to reach them again. These tests are the record of
 * why, as much as a guard against it returning.
 *
 * The delivery model they encode: the Vercel cron runs once a day at 12:00 UTC,
 * which is 09:00 in Brasília, and `sendNotification` picks up everyone whose
 * `next_push` has passed. So `scheduleNextPush` does not choose when a
 * notification is delivered — it chooses which day's run picks it up. Every
 * assertion about a stored timestamp is really an assertion about that.
 *
 * `lib/notifications.js` does work when it loads: `setVapidDetails` validates
 * the VAPID pair and `lib/usersdb` throws without Supabase credentials. So the
 * module is imported dynamically, after the environment is prepared. Real
 * generated VAPID keys are used because fake ones are rejected.
 *
 * Run with: npm test
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import webpush from "web-push";

const FUSO = "America/Sao_Paulo";

/** Hora em que o cron da Vercel roda, do dia de uma data qualquer. */
function execucaoDoCron(data: Date): Date {
  return new Date(
    Date.UTC(
      data.getUTCFullYear(),
      data.getUTCMonth(),
      data.getUTCDate(),
      12,
      0,
      0,
    ),
  );
}

/** A data como o Brasil a vê, em dd/mm/aaaa. */
function diaNoBrasil(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    dateStyle: "short",
  }).format(data);
}

let scheduleNextPush: (
  frequency: string,
  from?: Date,
) => Promise<Date | null>;
let isValidEmail: (email: unknown) => Promise<boolean>;

before(async () => {
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = publicKey;
  process.env.VAPID_PRIVATE_KEY = privateKey;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";

  ({ scheduleNextPush, isValidEmail } = await import("../lib/notifications.js"));
});

describe("scheduleNextPush", () => {
  test("um envio diário cai no dia seguinte, no fuso do Brasil", async () => {
    const de = new Date("2026-08-05T13:00:00Z"); // 10:00 BRT
    const proximo = await scheduleNextPush("Daily", de);

    assert.equal(diaNoBrasil(proximo!), "06/08/2026");
  });

  test("semanal soma sete dias, mensal soma um mês", async () => {
    const de = new Date("2026-08-05T13:00:00Z");

    assert.equal(diaNoBrasil((await scheduleNextPush("Weekly", de))!), "12/08/2026");
    assert.equal(diaNoBrasil((await scheduleNextPush("Monthly", de))!), "05/09/2026");
  });

  /**
   * O defeito que criou o balde onde ninguém olhava. O formulário gravava a hora
   * da inscrição deslocada em UTC, então quem assinasse tarde da noite no Brasil
   * caía no bloco UTC da manhã — e o cron, rodando 12:00 UTC, só avaliava o bloco
   * da tarde. A inscrição existia e nunca era vista.
   */
  test("inscrição às 23:30 no Brasil não escorrega para o dia errado", async () => {
    const de = new Date("2026-08-05T02:30:00Z"); // 23:30 BRT do dia 4

    const proximo = await scheduleNextPush("Daily", de);

    assert.equal(diaNoBrasil(proximo!), "05/08/2026");
  });

  /**
   * A invariante que faz o resto funcionar: o instante gravado precisa cair
   * antes da execução do cron do dia alvo, senão o envio escorrega um dia.
   */
  test("o instante gravado sempre precede o cron do seu próprio dia", async () => {
    const momentos = [
      "2026-08-05T02:30:00Z",
      "2026-08-05T11:59:00Z",
      "2026-08-05T12:00:00Z",
      "2026-08-05T23:59:00Z",
      "2026-12-31T23:00:00Z",
    ];

    for (const iso of momentos) {
      for (const freq of ["Daily", "Weekly", "Monthly"]) {
        const proximo = (await scheduleNextPush(freq, new Date(iso)))!;

        assert.ok(
          proximo <= execucaoDoCron(proximo),
          `${freq} a partir de ${iso} caiu em ${proximo.toISOString()}, ` +
            `depois do cron das 12:00 UTC do próprio dia`,
        );
        assert.ok(
          proximo > new Date(iso),
          `${freq} a partir de ${iso} agendou para o passado`,
        );
      }
    }
  });

  /**
   * Somar um mês a 31 de janeiro estourava para 3 de março: o JavaScript
   * normaliza "31 de fevereiro". Quem assinasse dia 31 esperava dois meses.
   */
  test("mensal não pula fevereiro", async () => {
    const naoBissexto = await scheduleNextPush(
      "Monthly",
      new Date("2026-01-31T13:00:00Z"),
    );
    const bissexto = await scheduleNextPush(
      "Monthly",
      new Date("2028-01-31T13:00:00Z"),
    );

    assert.equal(diaNoBrasil(naoBissexto!), "28/02/2026");
    assert.equal(diaNoBrasil(bissexto!), "29/02/2028");
  });

  test("mensal limita ao último dia de meses de 30", async () => {
    const proximo = await scheduleNextPush(
      "Monthly",
      new Date("2026-03-31T13:00:00Z"),
    );

    assert.equal(diaNoBrasil(proximo!), "30/04/2026");
  });

  test("mensal atravessa a virada do ano", async () => {
    const proximo = await scheduleNextPush(
      "Monthly",
      new Date("2026-12-15T13:00:00Z"),
    );

    assert.equal(diaNoBrasil(proximo!), "15/01/2027");
  });

  /**
   * Contar a partir do next_push antigo, e não de agora, transformava duas
   * semanas de queda em catorze notificações enfileiradas.
   */
  test("um atraso longo rende um envio, não a fila inteira", async () => {
    const agora = new Date("2026-08-06T13:00:00Z");

    const proximo = await scheduleNextPush("Daily", agora);

    assert.equal(diaNoBrasil(proximo!), "07/08/2026");
  });

  test("frequência desconhecida não agenda nada", async () => {
    assert.equal(await scheduleNextPush("Hourly", new Date()), null);
    assert.equal(await scheduleNextPush("", new Date()), null);
    assert.equal(await scheduleNextPush("daily", new Date()), null);
  });
});

describe("isValidEmail", () => {
  /**
   * A chamada em subscribeUser era feita sem `await`, e `!Promise` é sempre
   * falso — a validação nunca reprovou nada desde que existe. Qualquer string
   * passava como e-mail e ia para uma tabela de PII.
   */
  test("aceita endereço com formato válido", async () => {
    assert.equal(await isValidEmail("pessoa@exemplo.com"), true);
    assert.equal(await isValidEmail("a.b+c@sub.exemplo.com.br"), true);
  });

  test("recusa o que não é endereço", async () => {
    for (const entrada of ["", "sem-arroba", "a@b", "a b@c.com", "@exemplo.com"]) {
      assert.equal(
        await isValidEmail(entrada),
        false,
        `"${entrada}" passou como e-mail válido`,
      );
    }
  });

  test("recusa o que nem é string", async () => {
    for (const entrada of [null, undefined, 42, {}, []]) {
      assert.equal(await isValidEmail(entrada), false);
    }
  });
});
