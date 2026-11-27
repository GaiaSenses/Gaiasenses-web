"use client";
import { useEffect } from "react";
import { catalogoHabilitado } from "@/lib/criterios/catalogo";
import {
  UM_ANO_EM_SEGUNDOS,
  cookieDoRodizio,
  escreverMemoria,
  lerCookie,
  lerMemoria,
  textoDoCookie,
} from "@/lib/criterios/cookies";

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
    const memoria = lerMemoria(lerCookie(document.cookie, nome), catalogo);
    const valor = escreverMemoria(memoria, obra, Math.floor(Date.now() / 1000));
    document.cookie = textoDoCookie(nome, valor, UM_ANO_EM_SEGUNDOS);
  }, [criterioId, obra]);

  return null;
}
