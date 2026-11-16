import "server-only";
import webpush from "web-push";
import type { PostgrestError } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { DueRow, PushSender, PushStore } from "./deliver";
import type { PushSubscriptionJSON, SubscribeInput } from "./validation";

/**
 * Tudo que fala com o Supabase (tabela GaiaSubs) e com o serviço de push.
 *
 * O banco não é migrado automaticamente (ver supabase/README.md). Este código
 * funciona nos dois estados: com a migração 2026-11-16-gaiasubs-entrega
 * aplicada, usa a reserva atômica de linhas e grava o resultado de cada envio;
 * sem ela, cai no comportamento antigo e avisa no log. Assim o deploy não
 * depende da ordem em que alguém roda o SQL.
 */
const TABLE = "GaiaSubs";
const CLAIM_RPC = "claim_due_push_subscriptions";

/** Validade de uma notificação no serviço de push. Lembrete de ontem não serve hoje. */
const TTL_REMINDER = 60 * 60 * 12;
const TTL_WELCOME = 60 * 60;

/**
 * Prazo de cada envio. Sem ele, um serviço que aceita a conexão e não responde
 * prende o lote inteiro até a Vercel matar o cron (maxDuration 60 s) e todo
 * mundo depois dele perde o lembrete do dia. O erro de prazo não tem
 * statusCode, então conta como falha temporária.
 */
const SEND_TIMEOUT_MS = 10_000;

let vapidReady = false;

function ensureVapid() {
  if (vapidReady) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY ausente no ambiente");
  }
  webpush.setVapidDetails("mailto:gaiasenses.cti@gmail.com", publicKey, privateKey);
  vapidReady = true;
}

function makeSender(ttl: number): PushSender {
  return async (subscription, payload) => {
    ensureVapid();
    await webpush.sendNotification(subscription, payload, {
      TTL: ttl,
      urgency: "normal",
      timeout: SEND_TIMEOUT_MS,
    });
  };
}

export const sendReminder: PushSender = makeSender(TTL_REMINDER);
export const sendWelcome: PushSender = makeSender(TTL_WELCOME);

/** PGRST204: coluna que o PostgREST não conhece. 42703: coluna inexistente no Postgres. */
function isMissingColumn(error: PostgrestError | null) {
  return error?.code === "PGRST204" || error?.code === "42703";
}

/** PGRST202: função RPC que não existe. 42883: idem, vindo do Postgres. */
function isMissingFunction(error: PostgrestError | null) {
  return error?.code === "PGRST202" || error?.code === "42883";
}

function warnLegacy(what: string) {
  console.warn(
    `[push] ${what}: a migração supabase/migrations/2026-11-16-gaiasubs-entrega.sql ` +
      "ainda não foi aplicada. Funcionando no modo antigo, sem registro de entrega.",
  );
}

/** O store do job diário. Decide o modo (novo ou antigo) na primeira chamada. */
export function createSupabaseStore(): PushStore {
  const db = getSupabaseAdmin();
  let legacy = false;

  return {
    async claimDue(now) {
      const { data, error } = await db.rpc(CLAIM_RPC, { p_now: now.toISOString() });
      if (!error) return (data ?? []) as DueRow[];

      if (!isMissingFunction(error)) throw new Error(`claim falhou: ${error.code} ${error.message}`);

      legacy = true;
      warnLegacy("claimDue");
      const res = await db
        .from(TABLE)
        .select("user_id, frequency, subscription")
        .lte("next_push", now.toISOString());
      if (res.error) throw new Error(`select falhou: ${res.error.code} ${res.error.message}`);
      return (res.data ?? []) as DueRow[];
    },

    async markSent(userId, nextPush, now) {
      const update = legacy
        ? { next_push: nextPush.toISOString() }
        : {
            next_push: nextPush.toISOString(),
            last_sent_at: now.toISOString(),
            last_status: 201,
            fail_count: 0,
            claimed_until: null,
          };
      const { error } = await db.from(TABLE).update(update).eq("user_id", userId);
      if (error) throw new Error(`${error.code} ${error.message}`);
    },

    async markFailed(userId, status, failCount) {
      if (legacy) return; // sem colunas para guardar o resultado
      const { error } = await db
        .from(TABLE)
        .update({ last_status: status, fail_count: failCount, claimed_until: null })
        .eq("user_id", userId);
      if (error) throw new Error(`${error.code} ${error.message}`);
    },

    async remove(userId) {
      const { error } = await db.from(TABLE).delete().eq("user_id", userId);
      if (error) throw new Error(`${error.code} ${error.message}`);
    },
  };
}

/**
 * Grava a inscrição. O mesmo navegador (mesmo endpoint) não duplica a linha:
 * reinscrever atualiza frequência, nome, e-mail e idioma — é como alguém troca
 * de "diária" para "semanal" sem precisar cancelar antes.
 */
export async function saveSubscription(
  input: SubscribeInput,
  firstPush: Date,
): Promise<{ status: "created" | "updated"; userId: string | null }> {
  const db = getSupabaseAdmin();
  const userId = globalThis.crypto.randomUUID();

  const base = {
    name: input.name,
    email: input.email,
    frequency: input.frequency,
    next_push: firstPush.toISOString(),
    subscription: input.subscription,
  };
  const full = { ...base, locale: input.locale, fail_count: 0, last_status: null };

  let { error } = await db.from(TABLE).insert({ user_id: userId, ...full });
  if (isMissingColumn(error)) {
    warnLegacy("saveSubscription");
    ({ error } = await db.from(TABLE).insert({ user_id: userId, ...base }));
  }
  if (!error) return { status: "created", userId };

  // 23505: já existe linha para este endpoint (índice único da migração de 05/08).
  if (error.code !== "23505") throw new Error(`insert falhou: ${error.code} ${error.message}`);

  const byEndpoint = () =>
    db.from(TABLE).select("user_id").eq("subscription->>endpoint", input.subscription.endpoint);

  let upd = await db
    .from(TABLE)
    .update(full)
    .eq("subscription->>endpoint", input.subscription.endpoint)
    .select("user_id");
  if (isMissingColumn(upd.error)) {
    upd = await db
      .from(TABLE)
      .update(base)
      .eq("subscription->>endpoint", input.subscription.endpoint)
      .select("user_id");
  }
  if (upd.error) throw new Error(`update falhou: ${upd.error.code} ${upd.error.message}`);

  const existing = upd.data?.[0]?.user_id ?? (await byEndpoint()).data?.[0]?.user_id ?? null;
  return { status: "updated", userId: existing };
}

export async function deleteByEndpoint(endpoint: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("subscription->>endpoint", endpoint)
    .select("user_id");
  if (error) throw new Error(`delete falhou: ${error.code} ${error.message}`);
  return data?.length ?? 0;
}

export async function deleteByUserId(userId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq("user_id", userId);
  if (error) throw new Error(`delete falhou: ${error.code} ${error.message}`);
}

export async function existsByEndpoint(endpoint: string): Promise<boolean> {
  const { count, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("user_id", { count: "exact", head: true })
    .eq("subscription->>endpoint", endpoint);
  if (error) throw new Error(`consulta falhou: ${error.code} ${error.message}`);
  return (count ?? 0) > 0;
}

/**
 * O navegador trocou o endpoint (evento pushsubscriptionchange no sw.js).
 * O endpoint antigo funciona como prova de posse: só quem o tinha sabe qual é.
 *
 * O endereço é outro, então o histórico de falhas do antigo não vale para ele.
 * Se o endereço novo já tem linha própria (a pessoa se reinscreveu pelo
 * formulário ao mesmo tempo), a linha antiga só sobra: é apagada, em vez de o
 * índice único derrubar a rota com 500 e o endpoint velho ficar para o 410.
 */
export async function replaceSubscription(
  oldEndpoint: string,
  subscription: PushSubscriptionJSON,
): Promise<number> {
  const db = getSupabaseAdmin();
  const update = (values: Record<string, unknown>) =>
    db.from(TABLE).update(values).eq("subscription->>endpoint", oldEndpoint).select("user_id");

  let res = await update({ subscription, fail_count: 0, last_status: null });
  if (isMissingColumn(res.error)) res = await update({ subscription });
  if (res.error?.code === "23505") return deleteByEndpoint(oldEndpoint);
  if (res.error) throw new Error(`update falhou: ${res.error.code} ${res.error.message}`);
  return res.data?.length ?? 0;
}

export type PushStats = {
  subscribers: number;
  /** next_push mais de 26 h no passado: pelo menos uma execução do cron não os atendeu. */
  overdue: number;
  /** Com falha registrada na última tentativa (null sem a migração). */
  failing: number | null;
  lastSentAt: string | null;
  schema: "current" | "legacy";
};

/** Só contagens, nenhum dado pessoal. Usado por /api/health/push. */
export async function pushStats(now = new Date()): Promise<PushStats> {
  const db = getSupabaseAdmin();
  const head = { count: "exact" as const, head: true };

  const total = await db.from(TABLE).select("user_id", head);
  if (total.error) throw new Error(`${total.error.code} ${total.error.message}`);

  const limite = new Date(now.getTime() - 26 * 3600 * 1000).toISOString();
  const overdue = await db.from(TABLE).select("user_id", head).lt("next_push", limite);
  if (overdue.error) throw new Error(`${overdue.error.code} ${overdue.error.message}`);

  const failing = await db.from(TABLE).select("user_id", head).gt("fail_count", 0);
  if (isMissingColumn(failing.error)) {
    return { subscribers: total.count ?? 0, overdue: overdue.count ?? 0, failing: null, lastSentAt: null, schema: "legacy" };
  }
  if (failing.error) throw new Error(`${failing.error.code} ${failing.error.message}`);

  const last = await db
    .from(TABLE)
    .select("last_sent_at")
    .not("last_sent_at", "is", null)
    .order("last_sent_at", { ascending: false })
    .limit(1);
  if (last.error) throw new Error(`${last.error.code} ${last.error.message}`);

  return {
    subscribers: total.count ?? 0,
    overdue: overdue.count ?? 0,
    failing: failing.count ?? 0,
    lastSentAt: (last.data?.[0]?.last_sent_at as string | undefined) ?? null,
    schema: "current",
  };
}
