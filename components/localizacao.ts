// Fronteira entre a localização que chega de fora (cookie) e a que sai para o
// corpus (GaiaLogs). Duas garantias moram aqui:
//
// 1. Um cookie forjado nunca alcança o INSERT: só passa um objeto com lat/lng
//    numéricos dentro da faixa, e só essas duas chaves saem — qualquer campo
//    extra morre na leitura.
// 2. Coordenada gravada no corpus é a célula (~4 km), não a casa do visitante:
//    a pesquisa precisa da região da sessão, e precisão de metros é dado
//    pessoal que não temos por que reter (LGPD-01).

export const TAMANHO_DA_CELULA_EM_GRAUS = 0.04; // ~4,4 km no eixo da latitude

export type Localizacao = { lat: number; lng: number };

// O middleware grava o que o Vercel entrega em request.geo, e lá latitude e
// longitude são STRINGS ("-23.55"); no fallback de desenvolvimento são
// números. Os dois formatos são legítimos — qualquer outra coisa não é.
function paraNumeroFinito(valor: unknown): number | null {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : null;
  }
  if (typeof valor === "string" && valor.trim() !== "") {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
  }
  return null;
}

export function lerLocalizacaoDoCookie(
  valorDoCookie: string | undefined,
): Localizacao | null {
  if (!valorDoCookie) {
    return null;
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(valorDoCookie);
  } catch {
    return null;
  }

  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return null;
  }

  const candidato = bruto as Record<string, unknown>;
  const lat = paraNumeroFinito(candidato.lat);
  const lng = paraNumeroFinito(candidato.lng);
  if (lat === null || lng === null) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
}

export function arredondarACelula(grau: number): number {
  // Múltiplos de 0,04 têm 2 casas decimais exatas; o toFixed só limpa o ruído
  // binário da divisão (ex.: -23.560000000000002).
  return Number(
    (
      Math.round(grau / TAMANHO_DA_CELULA_EM_GRAUS) * TAMANHO_DA_CELULA_EM_GRAUS
    ).toFixed(2),
  );
}

export function minimizarLocalizacao(localizacao: Localizacao): Localizacao {
  return {
    lat: arredondarACelula(localizacao.lat),
    lng: arredondarACelula(localizacao.lng),
  };
}
