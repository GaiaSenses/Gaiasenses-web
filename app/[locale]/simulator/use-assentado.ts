"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * O valor depois que ele assenta: só passa adiante quando `chave` fica `ms` sem mudar. Serve ao
 * módulo da obra, que não deve remontar a cada passo de um slider.
 *
 * - Só vale com `ativo` (a obra tocando). Parado, devolve o valor na hora e já deixa o assentado
 *   igual a ele, para o "Tocar obra" começar pelo que está na tela, sem esperar o debounce.
 * - Quando `grupo` muda (outra obra), o valor novo vale na hora: os valores de uma obra não podem
 *   chegar à seguinte, nem por um instante.
 */
export function useAssentado<T>(valor: T, chave: string, ms: number, ativo: boolean, grupo = ""): T {
  const [assentado, setAssentado] = useState<{ chave: string; grupo: string; valor: T }>({ chave, grupo, valor });
  const atual = useRef(valor);
  useLayoutEffect(() => {
    atual.current = valor;
  });

  useEffect(() => {
    const assentar = () =>
      setAssentado((a) => (a.chave === chave && a.grupo === grupo ? a : { chave, grupo, valor: atual.current }));
    if (!ativo) {
      assentar();
      return;
    }
    // Outro grupo: assenta já. No mesmo grupo, só depois de `ms` sem mudança.
    setAssentado((a) => (a.grupo === grupo ? a : { chave, grupo, valor: atual.current }));
    const timer = window.setTimeout(assentar, ms);
    return () => window.clearTimeout(timer);
  }, [chave, grupo, ms, ativo]);

  return ativo && assentado.grupo === grupo ? assentado.valor : valor;
}
