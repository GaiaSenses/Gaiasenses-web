"use client";

/**
 * Placa do critério em foco (D3.5 + D4). A geometria vem de `montarPlaca`; aqui ela vira SVG,
 * numa caixa de tamanho natural que escala por `transform: scale()` até a largura disponível,
 * com os LEDs das obras como botões HTML por cima (a escala é a mesma, então eles não se
 * desalinham). Estreita demais, a placa para de encolher e rola na horizontal.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DeclaredCompositionName } from "@/components/compositions/compositions-declared.generated";
import type { EntradaClima, NomeEntrada, ResultadoDaComparacao, ResultadoDeDecisao } from "@/lib/criterios/tipos";
import { ENTRADAS } from "./cenario";
import { montarPlaca } from "./layout-placa";
import type { Selecao } from "./selecao";
import {
  LEGENDA_DOS_LEDS,
  caminhoDaEscolha,
  comDestaque,
  comoFoiEscolhida,
  corDoGrupo,
  formatarProbabilidade,
  formatarValor,
  rotuloDoCriterio,
} from "./apresentacao";
import { COR, ConectorJ1, NoCI, NoEntrada, NoObra, Trilhas, caminhoSvg } from "./pecas-da-placa";
import s from "./simulador.module.css";

const SO_DA_OBRA = ENTRADAS.filter((e) => e.grupo === "obra").map((e) => e.nome);
const ESCALA_MIN = 0.72;
const ESCALA_MAX = 1.15;

/** Rótulos curtos de serigrafia para as entradas (o painel mostra os do vocabulário). */
const NA_PLACA: Readonly<Record<NomeEntrada, string>> = {
  temperature: "temperatura",
  humidity: "umidade",
  clouds: "nuvens",
  rain: "chuva",
  windSpeed: "vento",
  windDeg: "direção do vento",
  lightningCount: "raios",
  fireCount: "focos",
  closeFires: "focos a < 50 km",
  lat: "latitude",
  lon: "longitude",
};

const COLUNAS = [
  ["entrada", "entradas"],
  ["transformacao", "transformação"],
  ["agregacao", "agregação"],
  ["decisao", "decisão"],
] as const;

type PropsDaZona = {
  doFoco: ResultadoDaComparacao | undefined;
  selecao: Selecao | undefined;
  entrada: EntradaClima;
  pulso: number;
  /** Quantas obras a memória de rodízio do critério em foco já guarda. */
  obrasNaMemoria: number;
  aoEscolher: (obra: DeclaredCompositionName) => void;
  aoSortearDeNovo: () => void;
  aoZerarMemoria: () => void;
};

/** A zona da placa: o critério em foco, SW1, a memória do rodízio e a placa (ou o erro do critério). */
export function ZonaDaPlaca({
  doFoco,
  selecao,
  entrada,
  pulso,
  obrasNaMemoria,
  aoEscolher,
  aoSortearDeNovo,
  aoZerarMemoria,
}: PropsDaZona) {
  const rodizio = doFoco?.ok && doFoco.resultado.sorteio === "deterministico";
  return (
    <section className={`${s.zona} ${s.zonaPlaca}`} aria-labelledby="titulo-placa">
      <h2 id="titulo-placa" className={s.zonaTitulo}>
        Placa do critério em foco
      </h2>
      <div className={s.placaCabeca}>
        {doFoco ? (
          <div>
            <p className={s.placaCriterio}>
              {rotuloDoCriterio(doFoco.criterio)} · v{doFoco.criterio.versao}
            </p>
            <p className={s.placaResumo}>{doFoco.criterio.resumo}</p>
          </div>
        ) : null}
        <div className={s.placaControles}>
          {doFoco?.criterio.usaMemoria ? (
            <div className={s.memoria}>
              <span>
                {obrasNaMemoria === 0
                  ? "Memória do rodízio vazia"
                  : `Memória do rodízio: ${obrasNaMemoria} ${obrasNaMemoria === 1 ? "obra tocada" : "obras tocadas"}`}
              </span>
              <button type="button" className={s.botaoSecundario} onClick={aoZerarMemoria}>
                Zerar memória
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className={s.tact}
            onClick={aoSortearDeNovo}
            disabled={!doFoco?.ok}
            title={rodizio ? "No rodízio não há sorteio: volta à obra do critério" : undefined}
          >
            <span className={s.tactCorpo} aria-hidden="true">
              <span className={s.tactCapa} />
            </span>
            <span>
              <span className={s.designador} aria-hidden="true">
                SW1
              </span>{" "}
              Sortear de novo
            </span>
          </button>
        </div>
      </div>
      {doFoco?.ok ? (
        <PlacaCircuito resultado={doFoco.resultado} selecao={selecao} entrada={entrada} pulso={pulso} aoEscolher={aoEscolher} />
      ) : doFoco ? (
        <p className={s.placaErro}>O critério falhou e não tem placa para mostrar: {doFoco.erro}</p>
      ) : null}
      <p className={s.placaDica}>Clique num LED aceso para escolher a obra à mão. SW1 volta à escolha do critério.</p>
    </section>
  );
}

type Props = {
  resultado: ResultadoDeDecisao;
  selecao: Selecao | undefined;
  entrada: EntradaClima;
  /** Muda quando a escolha muda: remonta o pulso para ele correr uma vez pelo caminho novo. */
  pulso: number;
  aoEscolher: (obra: DeclaredCompositionName) => void;
};

function PlacaCircuito({ resultado, selecao, entrada, pulso, aoEscolher }: Props) {
  const obraSelecionada = selecao?.obra ?? null;
  const g = useMemo(
    () => montarPlaca(comDestaque(resultado.circuito, obraSelecionada), SO_DA_OBRA),
    [resultado.circuito, obraSelecionada],
  );
  const caminho = useMemo(
    () => caminhoDaEscolha(g.trilhas, g.nos, obraSelecionada ? `obra:${obraSelecionada}` : null),
    [g, obraSelecionada],
  );
  const porId = useMemo(() => new Map(g.trilhas.map((t) => [t.id, t])), [g]);

  const rolagem = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Quando a fonte de serigrafia termina de carregar, redesenha para os textos se medirem de novo.
  const [, setFontes] = useState(0);
  useEffect(() => {
    let vivo = true;
    document.fonts?.ready.then(() => vivo && setFontes((n) => n + 1));
    return () => {
      vivo = false;
    };
  }, []);

  const escala = largura === null ? null : Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, largura / g.largura));
  const rola = largura !== null && largura < g.largura * ESCALA_MIN;
  const corDoVencedor = corDoGrupo(resultado.vencedor.id) ?? COR.serigrafia;
  const como = comoFoiEscolhida(resultado, selecao);
  const seloDe = (obra: string, candidata: boolean): string => {
    if (obra === obraSelecionada && como.tipo === "manual") return "à mão";
    if (!candidata || resultado.sorteio === "deterministico") return "";
    const p = resultado.candidatas.find((c) => c.obra === obra)?.probabilidade ?? 0;
    return formatarProbabilidade(p);
  };

  const obras = g.nos.filter((n) => n.estagio === "obra");
  const rotuloColuna = COLUNAS.map(([estagio, texto]) => {
    const nos = g.nos.filter((n) => n.estagio === estagio);
    const topo = Math.min(...nos.map((n) => n.y));
    return nos.length && topo > 22 ? { x: nos[0].x, y: topo - 10, texto } : null;
  });

  return (
    <>
      <div
        ref={rolagem}
        className={s.placaRolagem}
        {...(rola ? { tabIndex: 0, role: "region", "aria-label": "Placa do critério; role para os lados" } : {})}
      >
        <div
          className={s.placaCaixa}
          style={escala === null ? { visibility: "hidden" } : { width: g.largura * escala, height: g.altura * escala }}
        >
          <div
            className={s.placaNatural}
            style={{ width: g.largura, height: g.altura, transform: `scale(${escala ?? 1})` }}
          >
            <svg
              width={g.largura}
              height={g.altura}
              viewBox={`0 0 ${g.largura} ${g.altura}`}
              className={s.placaSvg}
              aria-hidden="true"
            >
              {rotuloColuna.map((r) =>
                r ? (
                  <text key={r.texto} x={r.x} y={r.y} className={s.tColuna}>
                    {r.texto}
                  </text>
                ) : null,
              )}
              <text x={16} y={g.altura - 6} className={s.tColuna}>
                barramento direto até o J1
              </text>

              <Trilhas trilhas={g.trilhas} />

              {g.nos.map((n) => {
                if (n.estagio === "entrada") {
                  const nome = n.id.slice("entrada:".length) as NomeEntrada;
                  const e = ENTRADAS.find((x) => x.nome === nome);
                  const v = entrada[nome];
                  const fracao = e && v !== null ? (v - e.faixa[0]) / (e.faixa[1] - e.faixa[0]) : null;
                  return (
                    <NoEntrada
                      key={n.id}
                      n={n}
                      rotulo={NA_PLACA[nome] ?? n.rotulo}
                      valor={v === null ? null : formatarValor(v, e?.passo ?? 1)}
                      fracao={fracao}
                    />
                  );
                }
                if (n.estagio === "obra") {
                  const obra = n.id.slice("obra:".length);
                  return <NoObra key={n.id} n={n} cor={corDoVencedor} selo={seloDe(obra, n.ativo)} />;
                }
                return <NoCI key={n.id} n={n} alturaLinha={g.alturaLinha} cor={corDoGrupo(n.grupo)} />;
              })}
              <ConectorJ1 x={g.j1.x} y={g.j1.y} />

              <g key={pulso} className={s.pulsos}>
                {caminho.map((c) => {
                  const t = porId.get(c.id);
                  return t ? (
                    <path
                      key={c.id}
                      d={caminhoSvg(t.pontos)}
                      pathLength={100}
                      className={s.pulso}
                      style={{ animationDelay: `${c.etapa * 140}ms` }}
                    />
                  ) : null;
                })}
              </g>
            </svg>

            {obras.map((n) => {
              const obra = n.id.slice("obra:".length) as DeclaredCompositionName;
              const selecionada = obra === obraSelecionada;
              return (
                <button
                  key={n.id}
                  type="button"
                  className={s.led}
                  data-obra={obra}
                  style={{ left: n.x - 6, top: n.y - 3, width: n.largura + 10, height: n.altura + 6 }}
                  disabled={!n.ativo}
                  aria-pressed={n.ativo ? selecionada : undefined}
                  aria-label={n.ativo ? `Escolher ${n.rotulo} à mão` : `${n.rotulo}, fora das candidatas`}
                  onClick={() => aoEscolher(obra)}
                />
              );
            })}
          </div>
        </div>
      </div>
      <ul className={s.legenda} aria-label="Cores dos LEDs">
        {LEGENDA_DOS_LEDS.map((l) => (
          <li key={l.cor}>
            <span className={s.legendaLed} style={{ background: l.cor }} aria-hidden="true" />
            {l.texto}
          </li>
        ))}
      </ul>
    </>
  );
}
