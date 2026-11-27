/**
 * Obras desabilitadas temporariamente.
 *
 * Pedido da Prof.ª Artemis em 2026-11-27, antes de uma demonstração: estas 8
 * obras ainda não estão prontas para o público geral. Elas NÃO foram apagadas —
 * só saem do sorteio do critério de decisão, do menu de obras do popup do mapa
 * e da lista do modo exposição. Um link direto `?composition=<obra>` continua
 * abrindo qualquer uma delas, para os pesquisadores mostrarem ou testarem.
 *
 * Para reabilitar uma obra, basta tirar o nome dela desta lista.
 *
 * Os nomes são os ids de `compositions/<pasta>/composition.json`; um teste
 * garante que cada um existe, porque um erro de grafia não desabilitaria nada.
 */
export const DISABLED_COMPOSITIONS: ReadonlySet<string> = new Set([
  "rectangles",
  "curves",
  "chaosTree",
  "weatherTree",
  "lluvia",
  "nightRain",
  "pump",
  "lightningBolts",
]);

export function isCompositionEnabled(name: string): boolean {
  return !DISABLED_COMPOSITIONS.has(name);
}

/**
 * Sorteia uma obra da lista, com a mesma chance para cada obra habilitada.
 * Devolve null quando todas as obras da lista estão desabilitadas — quem chama
 * decide o que tocar nesse caso.
 */
export function pickEnabledComposition(
  options: readonly string[],
  random: () => number = Math.random,
): string | null {
  const enabled = options.filter(isCompositionEnabled);
  if (enabled.length === 0) return null;
  return enabled[Math.floor(random() * enabled.length)];
}
