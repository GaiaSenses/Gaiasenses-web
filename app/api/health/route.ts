export const dynamic = "force-dynamic";

/**
 * Health das fontes de satélite — a metade web do OPS-04.
 *
 * Antes disto, uma queda do backend só aparecia como "fonte indisponível"
 * espalhada nas telas dos visitantes, e o diagnóstico exigia adivinhar entre
 * três suspeitos: o backend caiu, a env da Vercel está errada, ou a NOAA
 * atrasou. Esta rota separa os três em uma chamada.
 *
 * Cada fonte é consultada com coordenada fixa e raio mínimo, e o resultado
 * fica em cache por 5 minutos (`revalidate: 300`) — indisponibilidade aparece
 * em minutos, como o OPS-04 pede, sem gastar cota: no máximo ~600 chamadas por
 * mês contra o teto de 50.000 do UsagePlan.
 *
 * Não usa o getData de propósito: o cache de 2 h dele é certo para o mapa e
 * errado para saúde — um backend morto ficaria "ok" por até duas horas.
 */
const FONTES = ["fire", "lightning"] as const;

type EstadoFonte = {
  status: "ok" | "degraded";
  detail?: string;
};

async function checarFonte(fonte: (typeof FONTES)[number]): Promise<EstadoFonte> {
  const base = process.env.SATELLITE_API_URL?.trim()?.replace(/\/+$/, "");
  const key = process.env.SATELLITE_API_KEY?.trim();
  if (!base || !key) {
    return { status: "degraded", detail: "SATELLITE_API_URL ou SATELLITE_API_KEY ausente no ambiente" };
  }
  try {
    const res = await fetch(`${base}/${fonte}?lat=-23.55&lon=-46.66&dist=10`, {
      headers: { "x-api-key": key },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { status: "degraded", detail: `HTTP ${res.status}` };
    }
    const corpo = (await res.json()) as { count?: number };
    if (typeof corpo.count !== "number") {
      return { status: "degraded", detail: "resposta sem o campo count" };
    }
    return { status: "ok" };
  } catch (erro) {
    return {
      status: "degraded",
      detail: erro instanceof Error ? erro.message : "falha de rede",
    };
  }
}

export async function GET() {
  const [fire, lightning] = await Promise.all(FONTES.map(checarFonte));
  const geral = [fire, lightning].every((f) => f.status === "ok") ? "ok" : "degraded";
  // Response padrão, não NextResponse: o App Router aceita as duas, e a
  // padrão deixa esta rota testável em Node puro, sem carregar o framework.
  return Response.json(
    { status: geral, sources: { fire, lightning }, checkedAt: new Date().toISOString() },
    { status: geral === "ok" ? 200 : 503 },
  );
}
