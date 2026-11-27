/**
 * Aviso de que este navegador está com um critério de teste (cookie `gaia_criterio`): o que ele
 * toca não é o que o público vê e não entra no GaiaLogs.
 *
 * Uma linha pequena no canto superior esquerdo, na margem acima das coordenadas. O rodapé fica
 * livre: lá estão o logo e a atribuição do Mapbox, que os termos pedem sempre visíveis. A
 * largura para antes da coluna de botões da direita. Não recebe clique (`pointer-events:
 * none`), não tem link nem botão: só informa.
 */
export default function AvisoCriterioDeTeste({ texto }: { texto: string }) {
  return (
    <p
      role="status"
      className="pointer-events-none fixed left-0 top-0 z-[60] m-0 max-w-[calc(100vw-3.5rem)] truncate rounded-br bg-black/60 px-2 py-[3px] text-[10px] leading-[10px] text-white"
    >
      {texto}
    </p>
  );
}
