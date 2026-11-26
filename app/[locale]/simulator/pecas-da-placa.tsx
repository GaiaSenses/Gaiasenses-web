"use client";

/**
 * As peças desenhadas na placa (SVG): trimpots das entradas, CIs com fileiras de pinos, LEDs das
 * obras, o conector J1 e as trilhas. As cores repetem os tokens da D4 do `simulador.module.css`,
 * porque os atributos de preenchimento do SVG não leem variáveis CSS em todo navegador.
 */
import { useLayoutEffect, useRef, type ReactNode, type SVGProps } from "react";
import type { GeometriaPlaca, Trilha } from "./layout-placa";
import { partirValor, quebrarEmLinhas } from "./apresentacao";
import { SeteSegmentos, larguraDoDisplay } from "./sete-segmentos";
import s from "./simulador.module.css";

export const COR = {
  mascara: "#0F3D2E",
  trilhaCoberta: "#2A6B52",
  cobre: "#E8A15A",
  brilho: "#FFD08A",
  enig: "#D8B25C",
  serigrafia: "#EEF1E8",
  serigrafia2: "#A9BFB3",
  /** Corpo dos CIs e janela dos displays: epóxi preto, puxado para o verde da máscara. */
  epoxi: "#17201C",
  /** Segmento apagado do display e lente do LED desligado. */
  fantasma: "#26372F",
} as const;

type No = GeometriaPlaca["nos"][number];

/** Altura dos dígitos do valor de um CI. */
const ALTURA_DO_VALOR = 12;
/** Largura média estimada de um caractere de 11 px (designador, selo), para reservar espaço. */
const LETRA_PEQUENA = 5.6;

/**
 * Texto SVG que nunca passa de `max`: mede depois de desenhar e, se não couber, comprime com
 * `textLength`. Mede a cada render, então acompanha a troca da fonte quando ela termina de carregar.
 */
function TextoQueCabe({ max, children, ...props }: SVGProps<SVGTextElement> & { max: number; children: ReactNode }) {
  const ref = useRef<SVGTextElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.removeAttribute("textLength");
    el.removeAttribute("lengthAdjust");
    if (max > 0 && el.getComputedTextLength() > max) {
      el.setAttribute("textLength", String(max));
      el.setAttribute("lengthAdjust", "spacingAndGlyphs");
    }
  });
  return (
    <text ref={ref} {...props}>
      {children}
    </text>
  );
}

const pino = (x: number, y: number, k: string) => <rect key={k} x={x} y={y - 2.5} width={5} height={5} fill={COR.enig} />;

/** Entrada: footprint de trimpot com o rotor apontando o valor e o display com o número. */
export function NoEntrada({ n, rotulo, valor, fracao }: { n: No; rotulo: string; valor: string | null; fracao: number | null }) {
  const cy = n.y + n.altura / 2;
  const cx = n.x + 11;
  const angulo = ((-135 + 270 * (fracao ?? 0)) * Math.PI) / 180;
  const texto = valor ?? "--";
  const alturaDigito = 13;
  const wDisplay = larguraDoDisplay(texto, alturaDigito);
  const xFim = n.x + n.largura - 7;
  return (
    <g data-no={n.id}>
      <rect x={n.x + 0.5} y={n.y + 0.5} width={21} height={n.altura - 1} fill="none" className={s.contornoSerigrafia} />
      <circle cx={cx} cy={cy} r={7.5} fill={COR.epoxi} stroke={COR.enig} strokeWidth={1.4} />
      {fracao !== null ? (
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.sin(angulo) * 6}
          y2={cy - Math.cos(angulo) * 6}
          stroke={COR.enig}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ) : null}
      <TextoQueCabe
        x={n.x + 28}
        y={cy}
        dominantBaseline="central"
        className={n.ativo ? s.tRotulo : s.tRotuloMudo}
        max={xFim - wDisplay - 10 - (n.x + 28)}
      >
        {rotulo}
      </TextoQueCabe>
      <rect x={xFim - wDisplay - 4} y={cy - 9} width={wDisplay + 8} height={18} rx={1.5} fill={COR.epoxi} />
      <SeteSegmentos
        texto={texto}
        x={xFim}
        y={cy}
        altura={alturaDigito}
        alinhar="fim"
        aceso={valor === null ? COR.fantasma : n.ativo ? COR.brilho : COR.serigrafia2}
        apagado={COR.fantasma}
      />
      {pino(n.x + n.largura - 1, cy, "saida")}
    </g>
  );
}

/** O valor de um CI: número no display de 7 segmentos; o resto em texto de serigrafia. */
function Valor({ valor, x, y, alinhar, ativo, max }: { valor: string; x: number; y: number; alinhar: "fim" | "meio"; ativo: boolean; max: number }) {
  const { numero, resto } = partirValor(valor);
  const altura = ALTURA_DO_VALOR;
  if (numero === null) {
    return (
      <TextoQueCabe
        x={x}
        y={y}
        dominantBaseline="central"
        textAnchor={alinhar === "fim" ? "end" : "middle"}
        className={ativo ? s.tValor : s.tValorMudo}
        max={max}
      >
        {valor}
      </TextoQueCabe>
    );
  }
  const w = larguraDoDisplay(numero, altura);
  const wResto = resto ? resto.length * LETRA_PEQUENA + 4 : 0;
  const xFim = alinhar === "fim" ? x : x + (w + wResto) / 2;
  return (
    <g>
      <SeteSegmentos
        texto={numero}
        x={xFim}
        y={y}
        altura={altura}
        alinhar="fim"
        aceso={ativo ? COR.brilho : COR.serigrafia2}
        apagado={COR.fantasma}
      />
      {resto ? (
        <text x={xFim - w - 4} y={y} dominantBaseline="central" textAnchor="end" className={s.tDesignador}>
          {resto}
        </text>
      ) : null}
    </g>
  );
}

/** Largura que o valor ocupa à direita, para o rótulo saber até onde pode ir. */
function larguraDoValor(valor: string | undefined): number {
  if (!valor) return 0;
  const { numero, resto } = partirValor(valor);
  if (numero === null) return Math.min(valor.length * 5.6, 70);
  return larguraDoDisplay(numero, ALTURA_DO_VALOR) + (resto ? resto.length * LETRA_PEQUENA + 4 : 0);
}

/** CI: corpo de epóxi, uma fileira de pinos por linha e, se tem grupo, o LED da cor dele. */
export function NoCI({ n, alturaLinha, cor }: { n: No; alturaLinha: number; cor: string | null }) {
  const linhas = Math.max(1, Math.round(n.altura / alturaLinha + 0.2));
  const folga = (linhas * alturaLinha - n.altura) / 2;
  const centros = Array.from({ length: linhas }, (_, i) => n.y - folga + alturaLinha * (i + 0.5));
  const cy = n.y + n.altura / 2;
  const led = cor ? <Led cx={n.x + 9} cy={linhas > 1 ? n.y + 9 : cy} r={3} cor={cor} aceso={n.ativo} /> : null;

  let miolo: ReactNode;
  if (linhas === 1) {
    let x = n.x + (cor ? 17 : 7);
    const designador = n.designador ? (
      <text x={x} y={cy} dominantBaseline="central" className={s.tDesignador}>
        {n.designador}
      </text>
    ) : null;
    if (n.designador) x += n.designador.length * LETRA_PEQUENA + 4;
    const xFim = n.x + n.largura - 6;
    const wValor = larguraDoValor(n.valor);
    miolo = (
      <>
        {designador}
        <TextoQueCabe x={x} y={cy} dominantBaseline="central" className={n.ativo ? s.tRotulo : s.tRotuloMudo} max={xFim - wValor - 5 - x}>
          {n.rotulo}
        </TextoQueCabe>
        {n.valor ? <Valor valor={n.valor} x={xFim} y={cy} alinhar="fim" ativo={n.ativo} max={70} /> : null}
      </>
    );
  } else {
    // Mais de uma linha: o texto vai centrado no corpo, como a marcação de um CI.
    const rotulos = quebrarEmLinhas(n.rotulo, 18).slice(0, 3);
    const itens = [n.designador ? "d" : null, ...rotulos.map(() => "r"), n.valor ? "v" : null].filter(Boolean);
    const passo = 16;
    let y = cy - ((itens.length - 1) * passo) / 2;
    const cx = n.x + n.largura / 2;
    const max = n.largura - 14;
    const partes: ReactNode[] = [];
    if (n.designador) {
      partes.push(
        <text key="d" x={cx} y={y} dominantBaseline="central" textAnchor="middle" className={s.tDesignador}>
          {n.designador}
        </text>,
      );
      y += passo;
    }
    rotulos.forEach((r, i) => {
      partes.push(
        <TextoQueCabe key={`r${i}`} x={cx} y={y} dominantBaseline="central" textAnchor="middle" className={n.ativo ? s.tRotulo : s.tRotuloMudo} max={max}>
          {r}
        </TextoQueCabe>,
      );
      y += passo;
    });
    if (n.valor) partes.push(<Valor key="v" valor={n.valor} x={cx} y={y} alinhar="meio" ativo={n.ativo} max={max} />);
    miolo = partes;
  }

  return (
    <g data-no={n.id}>
      {centros.map((y, i) => (
        <g key={i}>
          {pino(n.x - 4, y, "e")}
          {pino(n.x + n.largura - 1, y, "s")}
        </g>
      ))}
      <rect
        x={n.x}
        y={n.y}
        width={n.largura}
        height={n.altura}
        rx={2}
        fill={COR.epoxi}
        stroke={n.ativo ? COR.cobre : "none"}
        strokeWidth={1}
      />
      {linhas > 1 ? <path d={`M ${n.x + n.largura / 2 - 5} ${n.y} a 5 5 0 0 0 10 0 z`} fill={COR.mascara} /> : null}
      {led}
      {miolo}
    </g>
  );
}

export function Led({ cx, cy, r, cor, aceso }: { cx: number; cy: number; r: number; cor: string; aceso: boolean }) {
  return aceso ? (
    <g>
      <circle cx={cx} cy={cy} r={r * 2} fill={cor} opacity={0.22} />
      <circle cx={cx} cy={cy} r={r} fill={cor} />
    </g>
  ) : (
    <circle cx={cx} cy={cy} r={r} fill={COR.fantasma} stroke={cor} strokeOpacity={0.45} strokeWidth={1} />
  );
}

/** Obra: LED (aceso = candidata, na cor do vencedor) e rótulo; a selecionada ganha o contorno ENIG. */
export function NoObra({ n, cor, selo }: { n: No; cor: string; selo: string }) {
  const cy = n.y + n.altura / 2;
  const xFim = n.x + n.largura - 6;
  return (
    <g data-no={n.id} data-destaque={n.destaque ? "true" : undefined}>
      {pino(n.x - 4, cy, "e")}
      {n.destaque ? (
        <>
          <rect x={n.x - 0.5} y={n.y - 1.5} width={n.largura + 1} height={n.altura + 3} rx={2} fill="none" stroke={COR.enig} strokeWidth={1.25} />
          {pino(n.x + n.largura - 1, cy, "s")}
        </>
      ) : null}
      <Led cx={n.x + 11} cy={cy} r={4.5} cor={cor} aceso={n.ativo} />
      <TextoQueCabe
        x={n.x + 22}
        y={cy}
        dominantBaseline="central"
        className={n.destaque ? s.tObraDestaque : n.ativo ? s.tRotulo : s.tRotuloMudo}
        max={xFim - (selo ? selo.length * LETRA_PEQUENA + 6 : 0) - (n.x + 22)}
      >
        {n.rotulo}
      </TextoQueCabe>
      {selo ? (
        <text x={xFim} y={cy} dominantBaseline="central" textAnchor="end" className={s.tDesignador}>
          {selo}
        </text>
      ) : null}
    </g>
  );
}

export function ConectorJ1({ x, y }: { x: number; y: number }) {
  return (
    <g data-no="j1">
      <text x={x + 6.5} y={y - 27} textAnchor="middle" className={s.tDesignador}>
        J1
      </text>
      <rect x={x + 1} y={y - 18} width={11} height={36} rx={1} fill={COR.epoxi} stroke={COR.enig} strokeWidth={1} />
      <rect x={x - 1} y={y - 3} width={8} height={6} fill={COR.enig} />
      <circle cx={x + 6.5} cy={y + 10} r={2} fill={COR.enig} />
      <circle cx={x + 6.5} cy={y - 10} r={2} fill={COR.enig} />
    </g>
  );
}

export function caminhoSvg(pontos: Trilha["pontos"]): string {
  return pontos.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}

/** Trilhas: as cobertas primeiro e as energizadas por cima, com a corrente correndo nelas. */
export function Trilhas({ trilhas }: { trilhas: readonly Trilha[] }) {
  const ordenadas = [...trilhas].sort((a, b) => Number(a.ativa) - Number(b.ativa));
  return (
    <g>
      {ordenadas.map((t) => {
        const d = caminhoSvg(t.pontos);
        const vias = t.direta ? viasDoBarramento(t.pontos) : [];
        return (
          <g key={t.id} data-trilha={t.id} data-energizada={t.ativa ? "true" : "false"}>
            <path
              d={d}
              className={t.ativa ? s.trilhaViva : s.trilhaMorta}
              style={t.ativa ? { strokeWidth: 1.3 + 2.2 * t.intensidade } : undefined}
            />
            {t.ativa && t.intensidade > 0 ? (
              <path d={d} className={s.corrente} style={{ opacity: 0.35 + 0.65 * t.intensidade }} />
            ) : null}
            {vias.map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r={3.4} fill={COR.enig} />
                <circle cx={x} cy={y} r={1.4} fill={COR.mascara} />
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** O barramento direto troca de camada ao descer ao canal de baixo e ao subir: uma via em cada ponta. */
function viasDoBarramento(pontos: Trilha["pontos"]): [number, number][] {
  const yCanal = Math.max(...pontos.map((p) => p[1]));
  const noCanal = pontos.filter((p) => p[1] === yCanal);
  if (noCanal.length < 2) return [];
  return [noCanal[0], noCanal[noCanal.length - 1]];
}
