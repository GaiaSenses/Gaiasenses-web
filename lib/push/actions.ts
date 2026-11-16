"use server";

/**
 * As ÚNICAS Server Actions do push. Todo export deste arquivo vira um endpoint
 * HTTP público, alcançável por qualquer cliente que leia o bundle — então só
 * entra aqui o que um visitante anônimo pode legitimamente fazer com o próprio
 * navegador: inscrever, consultar e cancelar a inscrição dele.
 *
 * O envio em massa NÃO pode ser importado aqui (F-SEC-01). Ele mora em
 * lib/push/deliver.ts e só é chamado por app/api/notifications/route.ts, atrás
 * do CRON_SECRET. tests/push-actions-surface.test.ts trava essa fronteira.
 *
 * Erros voltam como `reason` em vez de exceção: em produção o Next troca a
 * mensagem de qualquer exceção de Server Action por um texto genérico, e o
 * formulário precisa saber o que dizer à pessoa.
 */
import { buildPayload, classifyPushError, statusOf } from "./messages";
import { scheduleNextPush } from "./schedule";
import {
  deleteByEndpoint,
  deleteByUserId,
  existsByEndpoint,
  saveSubscription,
  sendWelcome,
} from "./server";
import { parseEndpoint, validateSubscribeInput, type ValidationError } from "./validation";

export type SubscribeResult =
  | { ok: true; status: "created" | "updated"; confirmed: boolean }
  | { ok: false; reason: ValidationError | "push-rejected" | "server-error" };

export async function subscribeUser(raw: unknown): Promise<SubscribeResult> {
  const parsed = validateSubscribeInput(raw);
  if (!parsed.ok) return { ok: false, reason: parsed.error };
  const input = parsed.value;

  // O primeiro envio é calculado aqui, não no navegador: o relógio e o fuso
  // do cliente não decidem em qual lote a pessoa entra.
  const firstPush = scheduleNextPush(input.frequency)!;

  let saved: Awaited<ReturnType<typeof saveSubscription>>;
  try {
    saved = await saveSubscription(input, firstPush);
  } catch (err) {
    // Nada de PII no log: só o motivo técnico.
    console.error("[push] falha ao inscrever:", (err as Error)?.message ?? err);
    return { ok: false, reason: "server-error" };
  }

  // Notificação de confirmação, na hora. Antes, a primeira mensagem só chegava
  // no cron do dia seguinte (de 9 a 33 horas depois), e quem testava concluía
  // que nada funcionava. Ela também prova o caminho inteiro — par VAPID,
  // serviço de push e sw.js — enquanto a pessoa ainda está na página.
  try {
    await sendWelcome(
      input.subscription,
      JSON.stringify(buildPayload("welcome", input.locale, input.frequency)),
    );
    return { ok: true, status: saved.status, confirmed: true };
  } catch (err) {
    const status = statusOf(err);
    if (classifyPushError(status) === "temporary") {
      console.warn("[push] confirmação não entregue agora:", status ?? (err as Error)?.message);
      return { ok: true, status: saved.status, confirmed: false };
    }

    // O serviço de push recusou o endereço: a inscrição nunca vai receber nada.
    // Desfazer a gravação em vez de deixar uma linha morta no banco.
    console.error("[push] serviço de push recusou a inscrição:", status);
    try {
      if (saved.userId) await deleteByUserId(saved.userId);
      else await deleteByEndpoint(input.subscription.endpoint);
    } catch (e) {
      console.error("[push] falha ao desfazer inscrição recusada:", (e as Error)?.message ?? e);
    }
    return { ok: false, reason: "push-rejected" };
  }
}

/** Aceita o endpoint puro ou o objeto da inscrição; a regra é a de parseEndpoint. */
function endpointOf(raw: unknown): string | null {
  return parseEndpoint(
    typeof raw === "string" ? raw : (raw as { endpoint?: unknown } | null)?.endpoint,
  );
}

/**
 * A tela pergunta ao banco, não só ao navegador. Antes, "Você está inscrito"
 * aparecia mesmo quando a linha já tinha sido apagada (endpoint expirado,
 * gravação que falhou), e a pessoa nunca mais recebia nada sem saber por quê.
 */
export async function getSubscriptionStatus(
  raw: unknown,
): Promise<{ ok: true; subscribed: boolean } | { ok: false }> {
  const endpoint = endpointOf(raw);
  if (!endpoint) return { ok: true, subscribed: false };
  try {
    return { ok: true, subscribed: await existsByEndpoint(endpoint) };
  } catch (err) {
    console.error("[push] falha ao consultar inscrição:", (err as Error)?.message ?? err);
    return { ok: false };
  }
}

export async function unsubscribeUser(
  raw: unknown,
): Promise<{ ok: true; deleted: number } | { ok: false; reason: "invalid-subscription" | "server-error" }> {
  const endpoint = endpointOf(raw);
  if (!endpoint) return { ok: false, reason: "invalid-subscription" };
  try {
    // Nenhuma linha apagada também é sucesso: o dado não está mais lá.
    return { ok: true, deleted: await deleteByEndpoint(endpoint) };
  } catch (err) {
    console.error("[push] falha ao descadastrar:", (err as Error)?.message ?? err);
    return { ok: false, reason: "server-error" };
  }
}
