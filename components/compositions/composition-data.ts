import { getFireSpots, getLightning, getWeather } from "@/components/getData";
import type {
  AudioCondition,
  AudioRule,
  CompositionAudio,
  CompositionManifest,
} from "./composition-audio";
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

export { resolveAudio } from "./composition-audio";
export type {
  AudioCondition,
  AudioRule,
  CompositionAudio,
  CompositionManifest,
};

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
