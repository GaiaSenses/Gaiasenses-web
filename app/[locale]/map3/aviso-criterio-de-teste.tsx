/**
 * Aviso de que este navegador está com um critério de teste (cookie `gaia_criterio`): o que ele
 * toca não é o que o público vê e não entra no GaiaLogs.
 *
 * Uma linha pequena no rodapé, à esquerda, abaixo dos botões do mapa e do player. Não recebe
 * clique (`pointer-events: none`), não tem link nem botão: só informa.
 */
export default function AvisoCriterioDeTeste({ texto }: { texto: string }) {
  return (
    <p
      role="status"
      className="pointer-events-none fixed bottom-0 left-0 z-[60] m-0 max-w-full truncate rounded-tr bg-black/60 px-2 py-[3px] text-[10px] leading-[10px] text-white"
    >
      {texto}
    </p>
  );
}
