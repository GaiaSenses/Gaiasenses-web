import { getFireSpots, getLightning, getWeather } from "@/components/getData";
import {
  COMPOSITION_ATTRIBUTES,
  COMPOSITION_ATTRIBUTE_ALIASES,
} from "@/lib/gaia-composition-attributes.generated";

/**
 * The data half of the declared-animation runtime.
 *
 * Every composition under `compositions/` used to need a hand-written React
 * wrapper — 23 of them, all doing the same four things in the same order: read
 * props, fetch the climate data the sketch needs, choose an audio file from
 * that data, and render the sketch inside the shared shell. The only genuinely
 * different part was the middle two, and both are describable.
 *
 * So they are described. `composition.json` says which attributes the sketch
 * consumes and how the audio follows from them, and this file does the rest.
 * Adding an animation stops being a code change, exactly as adding a patch
 * stopped being one when the `gaia.*` vocabulary arrived.
 *
 * The old hand-written wrappers still work: the registry carries both kinds and
 * `page.tsx` calls whatever it finds. Nothing had to be migrated for this to
 * ship.
 *
 * Split from the `.tsx` half on purpose. Node's test runner strips types from
 * `.ts` and not from `.tsx`, so anything that must be tested cannot live beside
 * JSX — and the parts worth testing are exactly these: which file an animation
 * plays, and whether a legacy attribute name still resolves. Both fail quietly.
 */

type Fonte = "weather" | "lightning" | "fire" | "position";

type DefinicaoAtributo = {
  label: string;
  unit: string;
  source: Fonte;
  path: string;
  range: [number, number];
};

const ATRIBUTOS = COMPOSITION_ATTRIBUTES as unknown as Record<
  string,
  DefinicaoAtributo
>;
const APELIDOS = COMPOSITION_ATTRIBUTE_ALIASES as unknown as Record<
  string,
  string
>;

/** Resolve a grafia antiga para a canônica, para animações migradas. */
export function canonicalAttribute(nome: string): string | null {
  if (nome in ATRIBUTOS) return nome;
  const apelido = APELIDOS[nome];
  return apelido && apelido in ATRIBUTOS ? apelido : null;
}

export type AudioStep = {
  /** Limite superior exclusivo. Ausente = "de qualquer valor acima daqui". */
  below?: number;
  /** Nome do arquivo em public/audios/, ou "" para silêncio. */
  file: string;
};

export type CompositionAudio =
  | { kind: "none" }
  /** O som vem de um patch Pd, que reage sozinho aos canais gaia.*. */
  | { kind: "patch" }
  /** Um arquivo fixo. */
  | { kind: "mp3"; file: string }
  /** Um arquivo escolhido por faixas de um atributo. */
  | { kind: "mp3"; by: string; steps: AudioStep[] };

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

export type SketchProps = Record<string, number | string | boolean | undefined>;

export type CompositionRuntimeProps = {
  lat: string;
  lon: string;
  play: boolean;
  today?: boolean;
  refresh?: string;
  /** Valores fornecidos direto, usados quando `today` é falso. */
  overrides?: Record<string, number>;
};

function ler(objeto: unknown, caminho: string): number | undefined {
  const valor = caminho
    .split(".")
    .reduce<unknown>(
      (atual, chave) =>
        atual && typeof atual === "object"
          ? (atual as Record<string, unknown>)[chave]
          : undefined,
      objeto,
    );

  return typeof valor === "number" && Number.isFinite(valor)
    ? valor
    : undefined;
}

/**
 * Busca só o que a animação declarou.
 *
 * Uma fonte indisponível vira zero, não erro. É a mesma escolha que os wrappers
 * antigos faziam, e pelo mesmo motivo: a animação não tem como desenhar "não
 * sei". Quem informa o público é o painel de dados, que mostra o estado
 * indisponível em vez de um número.
 */
export async function collect(
  atributosPedidos: string[],
  props: CompositionRuntimeProps,
): Promise<Record<string, number>> {
  const canonicos = atributosPedidos
    .map(canonicalAttribute)
    .filter((nome): nome is string => nome !== null);

  const fontes = new Set(canonicos.map((nome) => ATRIBUTOS[nome].source));
  const valores: Record<string, number> = {};

  const posicao = { lat: Number(props.lat), lon: Number(props.lon) };

  if (!props.today) {
    for (const nome of canonicos) {
      valores[nome] =
        props.overrides?.[nome] ??
        (ATRIBUTOS[nome].source === "position"
          ? ler(posicao, ATRIBUTOS[nome].path) ?? 0
          : 0);
    }
    return valores;
  }

  // As três chamadas de rede em paralelo: uma animação que peça clima e fogo
  // não deve esperar uma depois da outra.
  const [clima, raios, fogo] = await Promise.all([
    fontes.has("weather")
      ? getWeather(props.lat, props.lon).catch(() => null)
      : null,
    fontes.has("lightning")
      ? getLightning(props.lat, props.lon, 100).catch(() => null)
      : null,
    fontes.has("fire")
      ? getFireSpots(props.lat, props.lon, 100).catch(() => null)
      : null,
  ]);

  const porFonte: Record<Fonte, unknown> = {
    weather: clima,
    lightning: raios,
    fire: fogo
      ? {
          count: fogo.count,
          closeCount:
            fogo.events?.filter((evento) => evento.dist < 50).length ?? 0,
        }
      : null,
    position: posicao,
  };

  for (const nome of canonicos) {
    const definicao = ATRIBUTOS[nome];
    valores[nome] = ler(porFonte[definicao.source], definicao.path) ?? 0;
  }

  return valores;
}

/** Aplica a regra de áudio declarada. Devolve "" quando não há som. */
export function resolveAudio(
  audio: CompositionAudio,
  valores: Record<string, number>,
): string {
  if (audio.kind !== "mp3") return "";
  if ("file" in audio) return `/audios/${audio.file}`;

  const valor = valores[canonicalAttribute(audio.by) ?? audio.by] ?? 0;

  for (const faixa of audio.steps) {
    if (faixa.below === undefined || valor < faixa.below) {
      return faixa.file ? `/audios/${faixa.file}` : "";
    }
  }

  return "";
}
