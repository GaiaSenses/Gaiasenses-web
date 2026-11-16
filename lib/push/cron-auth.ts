import { timingSafeEqual } from "node:crypto";

/**
 * Confere o `Authorization: Bearer <CRON_SECRET>` que a Vercel manda nas
 * chamadas do cron. Usado pela rota do job e pela rota de saúde do push.
 * Comparação em tempo constante para não vazar o segredo por tempo de resposta.
 */
export function isCronAuthorized(request: Request): "ok" | "unauthorized" | "not-configured" {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "not-configured";

  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return "unauthorized";
  return "ok";
}
