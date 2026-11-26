"use client";

/**
 * O som da obra no simulador que não é o mp3 (D3.6): o patch Pd e o Tone do airports.
 *
 * - **Patch:** um efeito reconcilia o patch pedido com o do provider por `decidirAcaoDePatch` a
 *   cada mudança. Nunca chama `stopPatch` durante a carga: no main, a parada pedida no meio da
 *   carga se perde e o patch nasce tocando órfão. Espera a carga acabar e só então para.
 * - **Canais `gaia.*`:** saem do cenário e vão só para os receivers que o patch declara.
 * - **Desmonte:** `stopPatch()`, porque o provider não tem cleanup.
 * - **airports:** o `Discrete` liga o Tone ao montar e nunca o desliga. Ao sair dele, o contexto do
 *   Tone é trocado por um novo, suspenso, e o antigo é fechado com tudo o que ele montou; ao voltar,
 *   o `Tone.start()` do próprio `Discrete` liga o contexto novo e agenda a música do zero.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DeclaredCompositionName } from "@/components/compositions/compositions-manifests.generated";
import type { CompositionManifest } from "@/components/compositions/composition-audio";
import type { EntradaClima } from "@/lib/criterios/tipos";
import { usePd4Web } from "../map3/pd4web-context";
import { canaisDoCenario } from "./canais";
import { estadoDoPatch } from "./modulo";
import { decidirAcaoDePatch, patchDaObra } from "./troca-de-patch";

/** Uma segunda passada pega a música que o `Discrete` ainda estivesse montando quando saímos. */
const SEGUNDA_PASSADA_DO_TONE_MS = 1500;

/**
 * Suspender o contexto não basta: o `Discrete` deixa ligados os sintetizadores, um delay de 6 s
 * realimentado a 0,75 e notas agendadas fora do Transport, e tudo isso voltava a soar por baixo da
 * música nova quando o contexto era retomado. Um contexto novo no lugar e o antigo fechado levam o
 * grafo inteiro junto; o próximo `Discrete` monta no novo, suspenso até o `Tone.start()` dele.
 */
async function silenciarTone(): Promise<void> {
  try {
    const Tone = await import("tone");
    const novo = new Tone.Context();
    // `true` descarta o antigo: fecha o AudioContext dele e para o relógio do Transport.
    Tone.setContext(novo, true);
    // No navegador o contexto do Tone é sempre um AudioContext (o OfflineAudioContext é de render).
    // Sempre, e não só se já estiver "running": depois de um clique na página o Chrome cria o
    // contexto "suspended" e o liga sozinho logo em seguida.
    await (novo.rawContext as AudioContext).suspend();
  } catch (erro) {
    console.warn("simulador: não deu para silenciar o Tone do airports", erro);
  }
}

export function useAudioDaObra({
  obra,
  manifesto,
  tocando,
  entrada,
}: {
  obra: DeclaredCompositionName | null;
  manifesto: CompositionManifest | null;
  tocando: boolean;
  entrada: EntradaClima;
}): { estadoDoPatch: ReturnType<typeof estadoDoPatch> } {
  const { activePatch, loadingPatch, isInitializing, isStopping, startPatch, stopPatch, pd4web } = usePd4Web();

  const desejado = tocando && obra && manifesto ? patchDaObra(obra, manifesto) : null;
  const ativo = activePatch?.id ?? null;
  const carregando = !!loadingPatch || isInitializing;

  // Um patch que não carregou não é pedido de novo sozinho (senão o efeito tentaria sem fim):
  // volta a valer quando o pedido muda, por exemplo com Parar e Tocar.
  const [falhou, setFalhou] = useState<string | null>(null);
  useEffect(() => {
    if (falhou !== null && falhou !== desejado) setFalhou(null);
  }, [desejado, falhou]);

  // Um pedido em voo não se repete; `volta` reroda a reconciliação quando ele termina.
  const pedindo = useRef(false);
  const [volta, setVolta] = useState(0);
  useEffect(() => {
    if (pedindo.current) return;
    const acao = decidirAcaoDePatch({ desejado, ativo, carregando, parando: isStopping });
    if (acao === "parar") {
      void stopPatch();
    } else if (acao === "iniciar" && desejado !== null && desejado !== falhou) {
      pedindo.current = true;
      void startPatch(desejado).then((patch) => {
        pedindo.current = false;
        if (!patch) setFalhou(desejado);
        setVolta((n) => n + 1);
      });
    }
  }, [desejado, ativo, carregando, isStopping, falhou, volta, startPatch, stopPatch]);

  // Os canais do cenário, só para os receivers do patch ativo. A chave evita reenviar o mesmo.
  const canais = activePatch ? canaisDoCenario(entrada, activePatch.channels.receivers) : [];
  const chaveDosCanais = JSON.stringify(canais);
  const canaisRef = useRef(canais);
  useLayoutEffect(() => {
    canaisRef.current = canais;
  });
  useEffect(() => {
    if (!pd4web) return;
    for (const [receiver, valor] of canaisRef.current) pd4web.sendFloat(receiver, valor);
  }, [pd4web, chaveDosCanais]);

  // Desmonte do simulador: o provider não para nada sozinho.
  const pararRef = useRef(stopPatch);
  useLayoutEffect(() => {
    pararRef.current = stopPatch;
  });
  useEffect(() => () => void pararRef.current(), []);

  // Tone do airports: silencia ao sair (trocar de obra, Parar ou desmontar).
  const airportsTocando = tocando && obra === "airports";
  const segundaPassada = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!airportsTocando) return;
    window.clearTimeout(segundaPassada.current);
    return () => {
      void silenciarTone();
      segundaPassada.current = window.setTimeout(() => void silenciarTone(), SEGUNDA_PASSADA_DO_TONE_MS);
    };
  }, [airportsTocando]);

  return {
    estadoDoPatch: estadoDoPatch({ desejado, ativo, carregando, parando: isStopping, falhou }),
  };
}
