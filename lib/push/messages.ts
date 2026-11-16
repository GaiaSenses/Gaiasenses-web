/**
 * Conteúdo das notificações e a regra de como tratar cada resposta do serviço
 * de push. Módulo puro.
 */
import type { Frequency } from "./schedule";
import type { PushLocale } from "./validation";

export type PushKind = "welcome" | "reminder";

export type PushPayload = {
  title: string;
  body: string;
  icon: string;
  /** Mesmo tag = a notificação nova substitui a anterior em vez de empilhar. */
  tag: string;
  /** Caminho aberto pelo clique (lido por public/sw.js). */
  url: string;
};

const FREQ_LABEL: Record<PushLocale, Record<Frequency, string>> = {
  pt: { Daily: "todo dia", Weekly: "toda semana", Monthly: "todo mês" },
  en: { Daily: "every day", Weekly: "every week", Monthly: "every month" },
};

/**
 * O clique abre o mapa no idioma de quem se inscreveu. Sem lat/lng de propósito:
 * o middleware posiciona o mapa pela localização aproximada da requisição, então
 * "o clima na sua região" continua verdadeiro sem guardarmos onde a pessoa mora.
 */
export function buildPayload(
  kind: PushKind,
  locale: PushLocale,
  frequency?: Frequency,
): PushPayload {
  const url = `/${locale}/map3`;
  const base = { icon: "/icon-192.png", url };

  if (kind === "welcome") {
    const quando = frequency ? FREQ_LABEL[locale][frequency] : "";
    return locale === "en"
      ? {
          ...base,
          tag: "gaiasenses-welcome",
          title: "GaiaSenses: subscription confirmed",
          body: quando
            ? `You will get a reminder ${quando}, in the morning (Brazil time). Tap to open the map.`
            : "Tap to open the map.",
        }
      : {
          ...base,
          tag: "gaiasenses-welcome",
          title: "GaiaSenses: inscrição confirmada",
          body: quando
            ? `Você vai receber um lembrete ${quando}, pela manhã. Toque para abrir o mapa.`
            : "Toque para abrir o mapa.",
        };
  }

  return locale === "en"
    ? { ...base, tag: "gaiasenses-reminder", title: "GaiaSenses", body: "Tap to see the weather in your region!" }
    : { ...base, tag: "gaiasenses-reminder", title: "GaiaSenses", body: "Clique e veja o clima na sua região!" };
}

/**
 * Como tratar o erro de um envio.
 *
 * - gone: 404/410, o navegador diz que a inscrição morreu. Apaga na hora.
 * - permanent: 400 (inscrição malformada), 403 (par VAPID diferente do usado na
 *   inscrição), 413 (payload grande). Repetir não muda nada; apaga depois de
 *   MAX_PERMANENT_FAILURES tentativas seguidas.
 * - temporary: rede, 429, 5xx. Tenta de novo no próximo cron, sem limite.
 */
export type FailureKind = "gone" | "permanent" | "temporary";

export const MAX_PERMANENT_FAILURES = 3;

export function classifyPushError(statusCode: unknown): FailureKind {
  if (statusCode === 404 || statusCode === 410) return "gone";
  if (statusCode === 400 || statusCode === 403 || statusCode === 413) return "permanent";
  return "temporary";
}

export function statusOf(err: unknown): number | null {
  const code = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === "number" ? code : null;
}
