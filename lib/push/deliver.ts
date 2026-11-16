/**
 * O job diário de envio, com as dependências injetadas: quem guarda os dados
 * (`PushStore`) e quem fala com o serviço de push (`PushSender`). Assim a regra
 * inteira roda nos testes sem banco e sem rede.
 *
 * Este arquivo NÃO pode ganhar "use server". Antes, o envio em massa vivia num
 * módulo "use server" importado pelo formulário, e por isso ganhava um endpoint
 * de Server Action público — qualquer cliente disparava o job sem o
 * CRON_SECRET (F-SEC-01). Agora ele só é alcançável pela rota do cron.
 */
import { scheduleNextPush } from "./schedule";
import { buildPayload, classifyPushError, MAX_PERMANENT_FAILURES, statusOf } from "./messages";
import { normalizeLocale, type PushSubscriptionJSON } from "./validation";

export type DueRow = {
  user_id: string;
  frequency: string;
  subscription: PushSubscriptionJSON;
  locale?: string | null;
  fail_count?: number | null;
};

export interface PushStore {
  /** Devolve quem está devendo e, quando o banco permite, reserva essas linhas. */
  claimDue(now: Date): Promise<DueRow[]>;
  markSent(userId: string, nextPush: Date, now: Date): Promise<void>;
  markFailed(userId: string, status: number | null, failCount: number): Promise<void>;
  remove(userId: string): Promise<void>;
}

/** Envia; lança erro com `statusCode` quando o serviço de push recusa. */
export type PushSender = (subscription: PushSubscriptionJSON, payload: string) => Promise<void>;

export type DeliverySummary = {
  due: number;
  sent: number;
  removed: number;
  retryLater: number;
  failed: number;
};

type Outcome = keyof Omit<DeliverySummary, "due">;

/** Envios simultâneos. O laço sequencial antigo não escalava além de algumas dezenas. */
const DEFAULT_CONCURRENCY = 10;

export async function deliverDue(opts: {
  store: PushStore;
  send: PushSender;
  now?: Date;
  concurrency?: number;
  log?: (msg: string) => void;
}): Promise<DeliverySummary> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);

  const rows = await opts.store.claimDue(now);
  const summary: DeliverySummary = { due: rows.length, sent: 0, removed: 0, retryLater: 0, failed: 0 };

  for (let i = 0; i < rows.length; i += concurrency) {
    const lote = rows.slice(i, i + concurrency);
    const resultados = await Promise.all(lote.map((row) => processRow(row, opts.store, opts.send, now, log)));
    for (const r of resultados) summary[r]++;
  }

  return summary;
}

async function processRow(
  row: DueRow,
  store: PushStore,
  send: PushSender,
  now: Date,
  log: (msg: string) => void,
): Promise<Outcome> {
  const failCount = (row.fail_count ?? 0) + 1;

  const nextPush = scheduleNextPush(row.frequency, now);
  if (!nextPush) {
    log(`[push] ${row.user_id}: frequência desconhecida (${String(row.frequency)})`);
    await safe(() => store.markFailed(row.user_id, null, failCount), log);
    return "failed";
  }

  try {
    // Enviar antes de reagendar: se o envio falhar, next_push continua no
    // passado e a próxima execução tenta de novo.
    const payload = buildPayload("reminder", normalizeLocale(row.locale));
    await send(row.subscription, JSON.stringify(payload));
  } catch (err) {
    const status = statusOf(err);
    const kind = classifyPushError(status);

    if (kind === "gone" || (kind === "permanent" && failCount >= MAX_PERMANENT_FAILURES)) {
      // Guardar PII de quem não recebe mais nada também não se justifica perante a LGPD.
      await safe(() => store.remove(row.user_id), log);
      log(`[push] ${row.user_id}: removido (${status ?? "sem status"}, ${kind})`);
      return "removed";
    }

    await safe(() => store.markFailed(row.user_id, status, failCount), log);
    log(`[push] ${row.user_id}: falhou (${status ?? "rede"}, ${kind}, tentativa ${failCount})`);
    return "retryLater";
  }

  try {
    await store.markSent(row.user_id, nextPush, now);
  } catch (err) {
    // A notificação saiu, mas o reagendamento não. A próxima execução vai
    // reenviar; é melhor um envio a mais do que uma pessoa esquecida.
    log(`[push] ${row.user_id}: enviado, mas falhou ao reagendar: ${String((err as Error)?.message ?? err)}`);
    return "failed";
  }

  log(`[push] ${row.user_id}: enviado; próximo em ${nextPush.toISOString()}`);
  return "sent";
}

async function safe(fn: () => Promise<void>, log: (msg: string) => void) {
  try {
    await fn();
  } catch (err) {
    log(`[push] erro ao gravar resultado: ${String((err as Error)?.message ?? err)}`);
  }
}
