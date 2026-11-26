"use client";
import { useEffect } from "react";
import { catalogoHabilitado } from "@/lib/criterios/catalogo";
import { cookieDoRodizio, escreverMemoria, lerMemoria } from "@/lib/criterios/cookies";

const UM_ANO_EM_SEGUNDOS = 31536000;

/** O valor (já decodificado) de um cookie do navegador, ou `undefined`. */
function lerCookieDoNavegador(nome: string): string | undefined {
  const prefixo = `${nome}=`;
  const par = document.cookie.split("; ").find((p) => p.startsWith(prefixo));
  if (!par) return undefined;
  try {
    return decodeURIComponent(par.slice(prefixo.length));
  } catch {
    return undefined;
  }
}

/**
 * Avança o rodízio de um critério com memória: ao montar no player, grava no cookie
 * `gaia_rodizio_<id>` que `obra` tocou agora (tick em segundos), somando à memória que já
 * estava lá. Na próxima escolha, o servidor lê esse cookie e manda a obra para o fim da fila.
 *
 * Não desenha nada.
 */
export default function AvancarRodizio({
  criterioId,
  obra,
}: {
  criterioId: string;
  obra: string;
}) {
  useEffect(() => {
    const catalogo = catalogoHabilitado();
    // Uma obra fora do catálogo seria descartada na leitura; nem vale gravar.
    if (!catalogo.some((o) => o.id === obra)) return;

    const nome = cookieDoRodizio(criterioId);
    const memoria = lerMemoria(lerCookieDoNavegador(nome), catalogo);
    const valor = escreverMemoria(memoria, obra, Math.floor(Date.now() / 1000));
    document.cookie =
      `${nome}=${encodeURIComponent(valor)}; path=/; max-age=${UM_ANO_EM_SEGUNDOS}; samesite=lax`;
  }, [criterioId, obra]);

  return null;
}
