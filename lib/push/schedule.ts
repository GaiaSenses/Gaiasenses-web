/**
 * Agenda das notificações push. Módulo puro: sem rede, sem banco, sem
 * "use server" — pode ser importado pelo navegador, pelo servidor e pelos testes.
 *
 * Modelo de entrega: o cron da Vercel roda uma vez por dia às 12:00 UTC (09:00
 * em Brasília; no plano Hobby pode cair em qualquer minuto até 12:59) e envia a
 * todos cujo `next_push` já passou. Então esta função não escolhe a HORA do
 * envio — escolhe em qual execução diária a pessoa entra.
 */

export const FREQUENCIES = ["Daily", "Weekly", "Monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export function isFrequency(value: unknown): value is Frequency {
  return typeof value === "string" && (FREQUENCIES as readonly string[]).includes(value);
}

/** O público do GaiaSenses está no Brasil, e o combinado é notificar de manhã. */
const TIMEZONE = "America/Sao_Paulo";

/**
 * Hora UTC gravada em next_push. Precisa cair DEPOIS da execução do dia
 * anterior e ANTES da execução do dia alvo, para o registro entrar no lote
 * certo. 03:00 UTC é meia-noite em Brasília; mesmo que o horário de verão volte
 * (UTC-2), continua sendo madrugada local, muito antes das 09:00.
 */
const SCHEDULE_HOUR_UTC = 3;

/** Ano, mês e dia de um instante, vistos do Brasil. */
function brazilianDateParts(instant: Date) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(instant)
    .split("-")
    .map(Number);

  return { year, month, day };
}

/**
 * Próximo envio, contado a partir de `from` — normalmente agora, nunca a partir
 * do next_push antigo. Contar do valor antigo transformava um atraso de duas
 * semanas em catorze notificações enfileiradas.
 *
 * Devolve null para frequência desconhecida.
 */
export function scheduleNextPush(frequency: unknown, from: Date = new Date()): Date | null {
  if (!isFrequency(frequency)) return null;

  const { year, month, day } = brazilianDateParts(from);

  if (frequency === "Monthly") {
    // Somar um mês direto estoura em datas altas: 31 de janeiro vira 3 de março.
    // Fixar o dia 1, avançar o mês e só então limitar ao último dia existente.
    const target = new Date(Date.UTC(year, month, 1, SCHEDULE_HOUR_UTC));
    const lastDayOfTargetMonth = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();

    target.setUTCDate(Math.min(day, lastDayOfTargetMonth));
    return target;
  }

  const target = new Date(Date.UTC(year, month - 1, day, SCHEDULE_HOUR_UTC));
  target.setUTCDate(target.getUTCDate() + (frequency === "Weekly" ? 7 : 1));
  return target;
}
