/**
 * O que o módulo da obra mostra e decide (D3.6), sem React: a fonte e a legenda do áudio, o aviso
 * de clima, a chave de remontagem, a escala do monitor e o tick do rodízio.
 */
import type { DeclaredCompositionName } from "@/components/compositions/compositions-manifests.generated";
import { resolveAudio, type CompositionManifest } from "@/components/compositions/composition-audio";
import type { MemoriaDeRodizio } from "@/lib/criterios/tipos";
import { getMap3Pd4WebPatchById } from "../map3/pd4web-patches";
import { leOClima } from "./canais";
import { patchDaObra } from "./troca-de-patch";

/** Quem sintetiza o som das obras `synth` (o manifesto diz só que é síntese). */
const MOTOR_DA_SINTESE: Readonly<Record<string, string>> = {
  airports: "Tone.js",
  generativeStrings: "p5.sound",
};

export type AudioDaObra = {
  /** Caminho do arquivo em /audios, ou "" quando a regra não dá som. */
  mp3: string;
  /** O patch Pd que toca com a obra (o `mapa15` para as que mantêm o patch do mapa). */
  patch: string | null;
  /** O motor de síntese, quando é a própria obra que faz o som. */
  sintese: string | null;
};

export function audioDaObra(
  obra: DeclaredCompositionName,
  manifesto: CompositionManifest,
  props: Readonly<Record<string, number>>,
): AudioDaObra {
  return {
    mp3: resolveAudio(manifesto.audio, props),
    patch: patchDaObra(obra, manifesto),
    sintese: manifesto.audio.kind === "synth" ? (MOTOR_DA_SINTESE[obra] ?? "da própria obra") : null,
  };
}

/** A linha do som: "mp3 · FOGO-AA.mp3", "Pd · bubble1 · tocando", "síntese Tone.js" ou "sem áudio". */
export function legendaDoAudio(a: AudioDaObra, estadoDoPatch: string | null): string {
  const partes: string[] = [];
  if (a.mp3) partes.push(`mp3 · ${a.mp3.slice(a.mp3.lastIndexOf("/") + 1)}`);
  if (a.patch) partes.push(estadoDoPatch ? `Pd · ${a.patch} · ${estadoDoPatch}` : `Pd · ${a.patch}`);
  if (a.sintese) partes.push(`síntese ${a.sintese}`);
  return partes.length ? partes.join(" + ") : "sem áudio";
}

/** O aviso "o patch não lê o clima": a obra toca um patch e ele não ouve nenhum canal de clima. */
export function patchNaoLeOClima(patch: string | null): boolean {
  if (!patch) return false;
  const p = getMap3Pd4WebPatchById(patch);
  return !p || !leOClima(p.channels.receivers);
}

/**
 * Em que pé está o patch pedido, para a legenda: só "tocando" quando ele é o ativo e o provider
 * não está carregando nem parando nada. null quando nenhum patch foi pedido.
 */
export function estadoDoPatch(e: {
  desejado: string | null;
  ativo: string | null;
  carregando: boolean;
  parando: boolean;
  falhou: string | null;
}): "carregando" | "tocando" | "não carregou" | null {
  if (!e.desejado) return null;
  if (e.falhou === e.desejado) return "não carregou";
  if (e.ativo === e.desejado && !e.carregando && !e.parando) return "tocando";
  return "carregando";
}

/**
 * A `key` da obra montada: muda com a obra ou com o valor de um atributo que ELA declara. Mexer
 * num dado que a obra não usa não a remonta.
 */
export function chaveDaObra(
  obra: string,
  atributos: readonly string[],
  props: Readonly<Record<string, number>>,
): string {
  return [obra, ...atributos.map((a) => `${a}=${props[a] ?? ""}`)].join("|");
}

/**
 * Obras que acompanham os valores só pelas props e nunca remontam por eles. O airports é a primeira:
 * o `Discrete` não tem cleanup, então cada remontagem deixaria a música anterior tocando e somaria
 * outra cópia por cima. O `SatSketch` já segue lat e lon pelas props.
 */
const OBRAS_SEM_REMONTAGEM: ReadonlySet<string> = new Set(["airports"]);

/**
 * A `key` com que a obra é montada: a `chaveDaObra`, menos para as obras que não remontam por
 * valor (para essas, só a troca de obra remonta).
 */
export function chaveDeMontagem(
  obra: string,
  atributos: readonly string[],
  props: Readonly<Record<string, number>>,
): string {
  return OBRAS_SEM_REMONTAGEM.has(obra) ? obra : chaveDaObra(obra, atributos, props);
}

/**
 * Quanto o monitor (do tamanho da viewport, como o canvas das obras) encolhe para caber na área do
 * módulo. Nunca amplia; sem altura medida, vale só a largura.
 */
export function escalaDoMonitor(
  area: { largura: number; altura: number },
  tela: { largura: number; altura: number },
): number {
  if (area.largura <= 0 || tela.largura < 1 || tela.altura < 1) return 0;
  const pelaLargura = area.largura / tela.largura;
  const pelaAltura = area.altura > 0 ? area.altura / tela.altura : Infinity;
  return Math.min(1, pelaLargura, pelaAltura);
}

/**
 * O tick com que a obra que começou a tocar entra na memória: os segundos de agora, mas sempre
 * maior que o último da memória (dois toques no mesmo segundo não empatam no rodízio).
 */
export function proximoTick(memoria: MemoriaDeRodizio, agoraEmSegundos: number): number {
  const ticks = Object.values(memoria).filter((t) => Number.isFinite(t));
  const agora = Math.floor(agoraEmSegundos);
  return ticks.length ? Math.max(agora, Math.max(...ticks) + 1) : agora;
}
