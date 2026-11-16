import { NextResponse } from "next/server";
import { deliverDue } from "@/lib/push/deliver";
import { createSupabaseStore, sendReminder } from "@/lib/push/server";
import { isCronAuthorized } from "@/lib/push/cron-auth";

export const dynamic = "force-dynamic";
// Até 60 s no Hobby. O envio é em lotes paralelos, mas não deixamos o limite
// padrão cortar um lote no meio.
export const maxDuration = 60;

/**
 * Job diário de push, disparado pelo cron declarado em vercel.json.
 *
 * A Vercel envia `Authorization: Bearer <CRON_SECRET>` nas chamadas do cron
 * sempre que a variável existe no projeto. Sem ela, nada é enviado (fail
 * closed). O cron só roda em deployments de produção.
 *
 * Esta é a ÚNICA porta para o envio em massa. Ele já foi exportado de um módulo
 * "use server" e, por isso, alcançável sem segredo como Server Action (F-SEC-01).
 */
export async function GET(request: Request) {
  const auth = isCronAuthorized(request);
  if (auth === "not-configured") {
    console.error("[notifications] CRON_SECRET is not set — refusing to send notifications.");
    return NextResponse.json({ error: "Notification job is not configured." }, { status: 503 });
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await deliverDue({
      store: createSupabaseStore(),
      send: sendReminder,
      log: (msg) => console.log(msg),
    });
    // Uma linha só por execução, fácil de achar nos logs da Vercel.
    console.log("[notifications] resumo", JSON.stringify(summary));
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    console.error("[notifications] job falhou:", (err as Error)?.message ?? err);
    return NextResponse.json({ success: false, error: "Job failed" }, { status: 500 });
  }
}
