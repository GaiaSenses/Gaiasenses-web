/**
 * Display de 7 segmentos desenhado em SVG (D4: sem arquivo de fonte). Mostra dígitos, sinal de
 * menos, espaço e o ponto decimal (vírgula ou ponto, desenhado no canto do dígito anterior).
 * Os segmentos apagados ficam visíveis em fantasma, como num display de verdade.
 */
import { memo } from "react";

type Segmento = "a" | "b" | "c" | "d" | "e" | "f" | "g";

const ACESOS: Readonly<Record<string, readonly Segmento[]>> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "d", "c"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
  "-": ["g"],
  " ": [],
};

const TODOS: readonly Segmento[] = ["a", "b", "c", "d", "e", "f", "g"];

type Celula = { char: string; ponto: boolean };

function celulas(texto: string): Celula[] {
  const saida: Celula[] = [];
  for (const ch of texto) {
    if (ch === "." || ch === ",") {
      const ultima = saida.at(-1);
      if (ultima && !ultima.ponto) ultima.ponto = true;
      else saida.push({ char: " ", ponto: true });
    } else {
      saida.push({ char: ch in ACESOS ? ch : " ", ponto: false });
    }
  }
  return saida;
}

/** Proporções de um dígito: largura e vão entre dígitos, em fração da altura. */
const LARGURA = 0.52;
const VAO = 0.2;

export function larguraDoDisplay(texto: string, altura: number): number {
  const n = celulas(texto).length;
  return n === 0 ? 0 : n * altura * LARGURA + (n - 1) * altura * VAO;
}

const cache = new Map<number, Record<Segmento, string>>();

/** Os 7 polígonos de um dígito de altura h, com origem no canto de cima à esquerda. */
function poligonos(h: number): Record<Segmento, string> {
  const pronto = cache.get(h);
  if (pronto) return pronto;
  const w = h * LARGURA;
  const t = h * 0.15;
  const m = t / 2;
  const folga = t * 0.18;
  const r = (n: number) => Math.round(n * 100) / 100;
  const pts = (lista: [number, number][]) => lista.map(([x, y]) => `${r(x)},${r(y)}`).join(" ");
  const horizontal = (y: number) => {
    const x0 = m + folga;
    const x1 = w - m - folga;
    return pts([[x0, y], [x0 + m, y - m], [x1 - m, y - m], [x1, y], [x1 - m, y + m], [x0 + m, y + m]]);
  };
  const vertical = (x: number, y0: number, y1: number) =>
    pts([[x, y0], [x + m, y0 + m], [x + m, y1 - m], [x, y1], [x - m, y1 - m], [x - m, y0 + m]]);
  const meio = h / 2;
  const geo: Record<Segmento, string> = {
    a: horizontal(m),
    g: horizontal(meio),
    d: horizontal(h - m),
    f: vertical(m, m + folga, meio - folga),
    b: vertical(w - m, m + folga, meio - folga),
    e: vertical(m, meio + folga, h - m - folga),
    c: vertical(w - m, meio + folga, h - m - folga),
  };
  cache.set(h, geo);
  return geo;
}

type Props = {
  texto: string;
  /** Borda de referência: a esquerda (alinhar "inicio") ou a direita (alinhar "fim"). */
  x: number;
  /** Centro vertical. */
  y: number;
  altura: number;
  alinhar?: "inicio" | "fim";
  aceso: string;
  apagado: string;
};

function SeteSegmentosBase({ texto, x, y, altura, alinhar = "inicio", aceso, apagado }: Props) {
  const lista = celulas(texto);
  const largura = larguraDoDisplay(texto, altura);
  const x0 = alinhar === "fim" ? x - largura : x;
  const geo = poligonos(altura);
  const passo = altura * (LARGURA + VAO);
  return (
    // skewX dá a inclinação de display de verdade; a origem fica na base para não sair do lugar.
    <g transform={`translate(${x0} ${y - altura / 2}) translate(0 ${altura}) skewX(-7) translate(0 ${-altura})`}>
      {lista.map((cel, i) => {
        const acesos = ACESOS[cel.char] ?? [];
        return (
          <g key={i} transform={`translate(${i * passo} 0)`}>
            {TODOS.map((s) => (
              <polygon key={s} points={geo[s]} fill={acesos.includes(s) ? aceso : apagado} />
            ))}
            <circle
              cx={altura * LARGURA + altura * VAO * 0.45}
              cy={altura - altura * 0.075}
              r={altura * 0.075}
              fill={cel.ponto ? aceso : apagado}
            />
          </g>
        );
      })}
    </g>
  );
}

export const SeteSegmentos = memo(SeteSegmentosBase);
