import { NextResponse } from "next/server";
import { parseEndpoint, parseSubscription } from "@/lib/push/validation";
import { replaceSubscription } from "@/lib/push/server";

export const dynamic = "force-dynamic";

/**
 * Chamada pelo service worker (public/sw.js) no evento `pushsubscriptionchange`,
 * quando o navegador troca o endereço de entrega por conta própria. Sem isto a
 * linha ficava com o endpoint velho, o serviço de push respondia 410 e a pessoa
 * era removida sem ter pedido.
 *
 * O endpoint antigo é a prova de posse: é uma URL aleatória que só o navegador
 * dono conhece. Quem não a tem não consegue alterar nada.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const b = (body ?? {}) as { oldEndpoint?: unknown; subscription?: unknown };
  const oldEndpoint = parseEndpoint(b.oldEndpoint);
  const subscription = parseSubscription(b.subscription);
  if (!oldEndpoint || !subscription) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  try {
    const updated = await replaceSubscription(oldEndpoint, subscription);
    return NextResponse.json({ updated }, { status: updated ? 200 : 404 });
  } catch (err) {
    console.error("[push] resubscribe falhou:", (err as Error)?.message ?? err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
