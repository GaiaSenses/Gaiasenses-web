import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/push/cron-auth";
import { pushStats } from "@/lib/push/server";

export const dynamic = "force-dynamic";

/**
 * Saúde do push: responde "está funcionando?" sem abrir o Supabase.
 *
 * Só contagens, nenhum dado pessoal. Mesmo assim fica atrás do CRON_SECRET,
 * porque o número de inscritos não é informação pública. Uso:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/health/push
 *
 * `degraded` quando há inscritos atrasados mais de 26 h (o cron deixou de
 * atendê-los) ou quando o último envio registrado tem mais de 26 h.
 */
export async function GET(request: Request) {
  const auth = isCronAuthorized(request);
  if (auth === "not-configured") {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const stats = await pushStats(now);
    const stale =
      stats.lastSentAt !== null &&
      stats.subscribers > 0 &&
      now.getTime() - new Date(stats.lastSentAt).getTime() > 26 * 3600 * 1000;
    const status = stats.overdue > 0 || stale ? "degraded" : "ok";

    return NextResponse.json(
      { status, checkedAt: now.toISOString(), ...stats },
      { status: status === "ok" ? 200 : 503 },
    );
  } catch (err) {
    console.error("[health/push] falhou:", (err as Error)?.message ?? err);
    return NextResponse.json({ status: "degraded", detail: "database query failed" }, { status: 503 });
  }
}
