"use client";

/**
 * Trimpot (D4): slider serrilhado com campo numérico, para uma entrada do cenário.
 * O campo aceita vírgula ou ponto. O número digitado só vale no Enter ou ao sair do campo (Esc
 * desiste), e os dois caminhos levam o valor para a faixa e para o passo da entrada: o que a tela
 * mostra é o que o critério recebe.
 */
import { useId, useState, type CSSProperties } from "react";
import type { NomeEntrada } from "@/lib/criterios/tipos";
import { ajustarAoPasso, formatarValor, lerNumero } from "./apresentacao";
import s from "./simulador.module.css";

type Props = {
  nome: NomeEntrada;
  rotulo: string;
  unidade: string;
  faixa: readonly [number, number];
  passo: number;
  valor: number;
  /** Teto menor que o da faixa (o closeFires não passa do fireCount). */
  maximo?: number;
  desabilitado?: boolean;
  /** Dica curta sob o rótulo, quando o teto vem de outra entrada. */
  dica?: string;
  aoMudar: (valor: number) => void;
};

export function Trimpot({ nome, rotulo, unidade, faixa, passo, valor, maximo, desabilitado, dica, aoMudar }: Props) {
  const id = useId();
  const [rascunho, setRascunho] = useState<string | null>(null);
  const min = faixa[0];
  const max = Math.max(min, Math.min(faixa[1], maximo ?? faixa[1]));
  const pct = max > min ? ((valor - min) / (max - min)) * 100 : 0;
  const ajustar = (n: number) => ajustarAoPasso(n, min, max, passo);

  const confirmar = (texto: string) => {
    const n = lerNumero(texto);
    if (n !== null) aoMudar(ajustar(n));
    setRascunho(null);
  };

  return (
    <div className={s.trimpot} data-entrada={nome} data-desabilitado={desabilitado ? "true" : undefined}>
      <label htmlFor={`${id}-r`} className={s.trimpotRotulo}>
        {rotulo}
      </label>
      {dica ? <span className={s.trimpotDica}>{dica}</span> : null}
      <div className={s.trimpotLinha}>
        <input
          id={`${id}-r`}
          type="range"
          className={s.serrilhado}
          min={min}
          max={max}
          step={passo}
          value={valor}
          disabled={desabilitado || max === min}
          style={{ "--pct": `${pct}%` } as CSSProperties}
          onChange={(e) => aoMudar(ajustar(Number(e.target.value)))}
        />
        <span className={s.trimpotLeitura}>
          <input
            type="text"
            inputMode="decimal"
            className={s.trimpotCampo}
            aria-label={unidade ? `${rotulo}, em ${unidade}` : rotulo}
            value={rascunho ?? formatarValor(valor, passo)}
            disabled={desabilitado}
            onChange={(e) => setRascunho(e.target.value)}
            onBlur={() => {
              if (rascunho !== null) confirmar(rascunho);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && rascunho !== null) confirmar(rascunho);
              if (e.key === "Escape") setRascunho(null);
            }}
          />
          <span className={s.trimpotUnidade} aria-hidden="true">
            {unidade}
          </span>
        </span>
      </div>
    </div>
  );
}
