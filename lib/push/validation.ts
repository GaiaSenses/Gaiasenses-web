/**
 * Validação da inscrição de push. Módulo puro, usado pelo formulário (para dar
 * retorno imediato) e pela Server Action (que é quem decide de verdade).
 *
 * Antes, `isValidEmail` vivia num arquivo "use server": o navegador fazia uma
 * ida e volta HTTP só para testar uma regex, e o servidor precisava de uma cópia
 * síncrona porque todo export daquele arquivo era obrigatoriamente assíncrono.
 */
import { isFrequency, type Frequency } from "./schedule";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Tetos de tamanho: campos livres sem limite viram depósito de lixo numa tabela de PII. */
export const MAX_NAME = 120;
export const MAX_EMAIL = 254; // RFC 5321
const MAX_ENDPOINT = 2048;

export const LOCALES = ["pt", "en"] as const;
export type PushLocale = (typeof LOCALES)[number];

export function isValidEmail(email: unknown): boolean {
  return typeof email === "string" && email.length <= MAX_EMAIL && EMAIL_PATTERN.test(email);
}

export function normalizeLocale(value: unknown): PushLocale {
  return value === "en" ? "en" : "pt";
}

/** O que o navegador devolve em `PushSubscription.toJSON()`. */
export type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

/**
 * Aceita só o formato que o web-push consegue usar: endpoint https e as duas
 * chaves. Devolve uma cópia limpa, sem campos extras vindos do cliente.
 */
export function parseSubscription(value: unknown): PushSubscriptionJSON | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const keys = v.keys as Record<string, unknown> | undefined;

  if (typeof v.endpoint !== "string" || v.endpoint.length > MAX_ENDPOINT) return null;
  try {
    if (new URL(v.endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
  if (!keys.p256dh || !keys.auth || keys.p256dh.length > 256 || keys.auth.length > 256) return null;

  return {
    endpoint: v.endpoint,
    expirationTime: typeof v.expirationTime === "number" ? v.expirationTime : null,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

export type SubscribeInput = {
  name: string;
  email: string;
  frequency: Frequency;
  locale: PushLocale;
  subscription: PushSubscriptionJSON;
};

export type ValidationError =
  | "invalid-name"
  | "invalid-email"
  | "invalid-frequency"
  | "invalid-subscription";

export function validateSubscribeInput(
  raw: unknown,
): { ok: true; value: SubscribeInput } | { ok: false; error: ValidationError } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const email = typeof r.email === "string" ? r.email.trim() : "";

  if (!name || name.length > MAX_NAME) return { ok: false, error: "invalid-name" };
  if (!isValidEmail(email)) return { ok: false, error: "invalid-email" };
  if (!isFrequency(r.frequency)) return { ok: false, error: "invalid-frequency" };

  const subscription = parseSubscription(r.subscription);
  if (!subscription) return { ok: false, error: "invalid-subscription" };

  return {
    ok: true,
    value: { name, email, frequency: r.frequency, locale: normalizeLocale(r.locale), subscription },
  };
}
