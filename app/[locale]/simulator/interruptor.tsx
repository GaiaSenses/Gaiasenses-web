/**
 * Interruptor de alavanca (D4): um `role="switch"` com a alavanca que corre no trilho.
 * Ligado, o trilho fica cobre; o texto do rótulo não muda, o estado é o `aria-checked`.
 */
import s from "./simulador.module.css";

type Props = {
  rotulo: string;
  ligado: boolean;
  aoMudar: (ligado: boolean) => void;
  /** Gancho de teste: `data-interruptor`. */
  id: string;
};

export function Interruptor({ rotulo, ligado, aoMudar, id }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      className={s.interruptor}
      data-interruptor={id}
      onClick={() => aoMudar(!ligado)}
    >
      <span className={s.interruptorTrilho} aria-hidden="true">
        <span className={s.interruptorAlavanca} />
      </span>
      <span>{rotulo}</span>
    </button>
  );
}
