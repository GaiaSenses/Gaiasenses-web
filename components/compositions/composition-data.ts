import { getFireSpots, getLightning, getWeather } from "@/components/getData";
import { COMPOSITION_ATTRIBUTES } from "@/lib/gaia-composition-attributes.generated";

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

/**
 * Confere que o nome existe no vocabulário.
 *
 * Não há apelidos: cada dado tem um nome, e só. O catálogo antigo tinha
 * `windSpeed` numa entrada e `windspeed` noutra, e a segunda simplesmente não
 * chegava a lugar nenhum. Aceitar as duas teria preservado esse tipo de engano
 * em vez de eliminá-lo; quem errar a grafia recebe a sugestão certa do
 * validador, o que resolve a ergonomia sem criar um segundo conjunto.
 */
export function canonicalAttribute(nome: string): string | null {
  return nome in ATRIBUTOS ? nome : null;
}

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
