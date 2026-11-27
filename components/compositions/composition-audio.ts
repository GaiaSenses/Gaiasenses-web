/**
 * A regra de áudio declarada, sem nenhuma dependência de servidor.
 *
 * Fica separada de `composition-data.ts` porque aquele arquivo importa a busca
 * de dados (`getData`), que só roda no servidor. O navegador, o simulador entre
 * eles, precisa da mesma regra e não pode puxar a rede junto.
 */

/**
 * Condição sobre um dado. Todos os limites são combinados por "e".
 *
 * Quatro operadores em vez de dois porque as regras reais precisam dos quatro:
 * "chuva igual a zero" quer `max: 0`, e "chuva abaixo de 3" quer `below: 3`.
 * Escolher só um obrigaria a escrever `below: 0.0001` para dizer zero.
 */
export type AudioCondition = {
  /** Maior ou igual. */
  min?: number;
  /** Menor ou igual. */
  max?: number;
  /** Estritamente menor. */
  below?: number;
  /** Estritamente maior. */
  above?: number;
};

export type AudioRule = {
  /** Condições por dado. Ausente = sempre verdadeira, o caso final. */
  when?: Record<string, AudioCondition>;
  /** Nome do arquivo em public/audios/, ou "" para silêncio. */
  file: string;
};

export type CompositionAudio =
  | { kind: "none" }
  /** O som vem de um patch Pd, que reage sozinho aos canais gaia.*. */
  | { kind: "patch" }
  /**
   * A própria animação sintetiza o som — Tone.js em `airports`, p5.sound em
   * `generativeStrings`. Não há arquivo a tocar, então o runtime se comporta
   * como em `none`; o que muda é a verdade do catálogo. As duas declaravam
   * `none`, e quem lesse o manifesto para saber "esta obra tem áudio?" errava
   * nas duas.
   */
  | { kind: "synth" }
  /** Um arquivo fixo. */
  | { kind: "mp3"; file: string }
  /** A primeira regra que couber decide. */
  | { kind: "mp3"; rules: AudioRule[] };

export type CompositionManifest = {
  id: string;
  label: string;
  attributes: string[];
  audio: CompositionAudio;
  thumb: string;
  author?: string;
  openProcessingLink?: string;
  keepMapPatch?: boolean;
};

function cabe(condicao: AudioCondition, valor: number): boolean {
  if (condicao.min !== undefined && valor < condicao.min) return false;
  if (condicao.max !== undefined && valor > condicao.max) return false;
  if (condicao.below !== undefined && valor >= condicao.below) return false;
  if (condicao.above !== undefined && valor <= condicao.above) return false;
  return true;
}

/**
 * Aplica a regra de áudio declarada. Devolve "" quando não há som.
 *
 * A primeira regra que couber decide, como numa sequência de `if`. A ordem é
 * significativa e o validador cobra que a última não tenha condição, senão há
 * um estado do mundo em que a animação fica muda sem ninguém ter pedido.
 */
export function resolveAudio(
  audio: CompositionAudio,
  valores: Record<string, number>,
): string {
  if (audio.kind !== "mp3") return "";
  if ("file" in audio) return `/audios/${audio.file}`;

  for (const regra of audio.rules) {
    const casa = Object.entries(regra.when ?? {}).every(([dado, condicao]) =>
      cabe(condicao, valores[dado] ?? 0),
    );
    if (casa) return regra.file ? `/audios/${regra.file}` : "";
  }

  return "";
}
