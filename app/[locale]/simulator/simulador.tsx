"use client";

/**
 * Simulador de critérios (D3): o estado da página. A cada mudança do cenário, os cinco critérios
 * são avaliados de novo; cada um guarda a sua seleção (`selecao.ts`) e a sua memória de rodízio.
 * O cenário e a seleção do critério em foco vão para a URL (`replaceState`, ~150 ms), e o resumo
 * do foco sai num `aria-live`. O módulo da obra segue a seleção do foco, com debounce de ~400 ms
 * enquanto toca, e cada obra que começa a tocar avança o rodízio daquele critério.
 *
 * Tudo começa depois de montar: a URL, o cookie e o sorteio só existem no navegador, e assim o
 * HTML do servidor (só o aviso de carregando) nunca diverge do primeiro render do cliente.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DeclaredCompositionName } from "@/components/compositions/compositions-declared.generated";
import type { DECLARED_COMPOSITION_MANIFESTS } from "@/components/compositions/compositions-manifests.generated";
import { gerenciador } from "@/lib/criterios/gerenciador";
import { COOKIE_CRITERIO, cookieDoCriterio, lerCookie, lerIdDoCriterio } from "@/lib/criterios/cookies";
import { normalDe } from "@/lib/criterios/normais-do-estudo";
import type {
  IdCriterio,
  MemoriaDeRodizio,
  ObraDoCatalogo,
  ResultadoDaComparacao,
} from "@/lib/criterios/tipos";
import { PRESETS, entradaEfetiva, escreverCenario, type Cenario } from "./cenario";
import { escolherManual, escreverSelecao, lerSelecao, manterAoTocar, proximaSelecao, type Selecao } from "./selecao";
import {
  cenarioInicial,
  comoFoiEscolhida,
  origemDaEscolha,
  presetDoCenario,
  resumoDoFoco,
} from "./apresentacao";
import { proximoTick } from "./modulo";
import { ModuloObra } from "./modulo-obra";
import { useAssentado } from "./use-assentado";
import { Comparacao } from "./comparacao";
import { NormalDeReferencia, PainelEntradas } from "./painel-entradas";
import { ZonaDaPlaca } from "./placa-circuito";
import s from "./simulador.module.css";

type Manifestos = typeof DECLARED_COMPOSITION_MANIFESTS;
type Memorias = Partial<Record<IdCriterio, MemoriaDeRodizio>>;
type Selecoes = Partial<Record<IdCriterio, Selecao>>;
type Estado = {
  cenario: Cenario;
  memorias: Memorias;
  resultados: ResultadoDaComparacao[];
  selecoes: Selecoes;
  /** O módulo está com a obra montada e o som ligado. */
  tocando: boolean;
};

/** Quanto a seleção do foco fica parada antes de o módulo trocar de obra (a placa troca na hora). */
const TROCA_DE_OBRA_MS = 400;

type Props = { catalogo: readonly ObraDoCatalogo[]; manifestos: Manifestos };

function avaliar(cenario: Cenario, memorias: Memorias, catalogo: readonly ObraDoCatalogo[]): ResultadoDaComparacao[] {
  const { cidade, mes, periodo } = cenario.normalRef;
  const normal = normalDe(cidade, mes, periodo);
  return gerenciador.avaliarTodos(entradaEfetiva(cenario), (c) => ({
    catalogo,
    memoria: memorias[c.id] ?? {},
    normal: c.usaNormal ? normal : null,
    sortear: Math.random,
  }));
}

/**
 * A seleção de cada critério depois de uma avaliação. `tocandoNo` é o critério cuja obra está
 * tocando: ela fica enquanto continuar candidata, mesmo no rodízio (`manterAoTocar`).
 */
function selecionar(
  resultados: readonly ResultadoDaComparacao[],
  anteriores: Selecoes,
  tocandoNo: IdCriterio | null,
): Selecoes {
  const novas: Selecoes = {};
  for (const r of resultados) {
    if (!r.ok) continue;
    const anterior = anteriores[r.criterio.id] ?? null;
    novas[r.criterio.id] =
      r.criterio.id === tocandoNo ? manterAoTocar(anterior, r.resultado) : proximaSelecao(anterior, r.resultado);
  }
  return novas;
}

function tocandoNo(e: Estado): IdCriterio | null {
  return e.tocando ? e.cenario.foco : null;
}

function lerCriterioDoNavegador(): IdCriterio | null {
  return lerIdDoCriterio(lerCookie(document.cookie, COOKIE_CRITERIO));
}

export default function Simulador({ catalogo, manifestos }: Props) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [doNavegador, setDoNavegador] = useState<IdCriterio | null>(null);
  const [copiado, setCopiado] = useState<"" | "ok" | "erro">("");
  const [pulso, setPulso] = useState(0);
  // O estado mais recente para quem roda fora do render (o timer da URL e o "Copiar link").
  const estadoRef = useRef<Estado | null>(null);
  useLayoutEffect(() => {
    estadoRef.current = estado;
  });

  const rotuloDaObra = useCallback(
    (id: string) => (manifestos as Record<string, { label: string }>)[id]?.label ?? id,
    [manifestos],
  );

  // Ao montar: a URL manda no cenário e na seleção do foco (se veio dela; senão é o "Dia limpo" e
  // o lat/lng/mode do middleware saem já aqui); o cookie diz o critério deste navegador.
  useEffect(() => {
    const { cenario, params } = cenarioInicial(new URLSearchParams(window.location.search));
    const busca = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${busca ? `?${busca}` : ""}`);
    const resultados = avaliar(cenario, {}, catalogo);
    const selecoes = selecionar(resultados, {}, null);
    const doFoco = resultados.find((r) => r.criterio.id === cenario.foco);
    if (doFoco?.ok) {
      const daUrl = lerSelecao(params, doFoco.resultado);
      if (daUrl) selecoes[cenario.foco] = daUrl;
    }
    setEstado({ cenario, memorias: {}, resultados, selecoes, tocando: false });
    setDoNavegador(lerCriterioDoNavegador());
  }, [catalogo]);

  const mudarCenario = useCallback(
    (f: (c: Cenario) => Cenario) =>
      setEstado((e) => {
        if (!e) return e;
        const cenario = f(e.cenario);
        const resultados = avaliar(cenario, e.memorias, catalogo);
        return { ...e, cenario, resultados, selecoes: selecionar(resultados, e.selecoes, tocandoNo({ ...e, cenario })) };
      }),
    [catalogo],
  );

  const focar = useCallback(
    (foco: IdCriterio) => setEstado((e) => (e && e.cenario.foco !== foco ? { ...e, cenario: { ...e.cenario, foco } } : e)),
    [],
  );

  /** SW1: sorteia de novo só o critério em foco e fica com a escolha dele. */
  const sortearDeNovo = useCallback(
    () =>
      setEstado((e) => {
        if (!e) return e;
        const foco = e.cenario.foco;
        const novo = avaliar(e.cenario, e.memorias, catalogo).find((r) => r.criterio.id === foco);
        if (!novo) return e;
        const resultados = e.resultados.map((r) => (r.criterio.id === foco ? novo : r));
        const selecoes = { ...e.selecoes };
        if (novo.ok) selecoes[foco] = { obra: novo.resultado.escolha, origem: "criterio" };
        else delete selecoes[foco];
        return { ...e, resultados, selecoes };
      }),
    [catalogo],
  );

  /** LED aceso: a obra escolhida à mão, que vale enquanto continuar candidata. */
  const escolher = useCallback(
    (obra: DeclaredCompositionName) =>
      setEstado((e) => {
        if (!e) return e;
        const foco = e.cenario.foco;
        const r = e.resultados.find((x) => x.criterio.id === foco);
        if (!r?.ok) return e;
        const anterior = e.selecoes[foco] ?? { obra: null, origem: "criterio" as const };
        return { ...e, selecoes: { ...e.selecoes, [foco]: escolherManual(anterior, r.resultado, obra) } };
      }),
    [],
  );

  const zerarMemoria = useCallback(
    () =>
      setEstado((e) => {
        if (!e) return e;
        const memorias = { ...e.memorias, [e.cenario.foco]: {} };
        const resultados = avaliar(e.cenario, memorias, catalogo);
        return { ...e, memorias, resultados, selecoes: selecionar(resultados, e.selecoes, tocandoNo(e)) };
      }),
    [catalogo],
  );

  const tocar = useCallback(() => setEstado((e) => (e && !e.tocando ? { ...e, tocando: true } : e)), []);

  /** Parar encerra a "visita": a seleção volta a seguir o critério, e o rodízio mostra a próxima. */
  const parar = useCallback(
    () =>
      setEstado((e) => (e && e.tocando ? { ...e, tocando: false, selecoes: selecionar(e.resultados, e.selecoes, null) } : e)),
    [],
  );

  /**
   * A obra começou a tocar: no critério em foco com memória, ela entra no rodízio com um tick novo
   * e o critério é avaliado de novo. A seleção do foco não muda aqui (a memória vale para a
   * próxima escolha); se mudasse, a obra nova avançaria a memória de novo, sem fim.
   */
  const avancarRodizio = useCallback(
    (obra: DeclaredCompositionName) =>
      setEstado((e) => {
        if (!e?.tocando) return e;
        const foco = e.cenario.foco;
        const atual = e.resultados.find((r) => r.criterio.id === foco);
        if (!atual?.criterio.usaMemoria || e.selecoes[foco]?.obra !== obra) return e;
        const memoria = e.memorias[foco] ?? {};
        const memorias = { ...e.memorias, [foco]: { ...memoria, [obra]: proximoTick(memoria, Date.now() / 1000) } };
        const novo = avaliar(e.cenario, memorias, catalogo).find((r) => r.criterio.id === foco);
        const resultados = novo ? e.resultados.map((r) => (r.criterio.id === foco ? novo : r)) : e.resultados;
        return { ...e, memorias, resultados };
      }),
    [catalogo],
  );

  const usarNoNavegador = useCallback((id: IdCriterio) => {
    document.cookie = cookieDoCriterio(id);
    setDoNavegador(lerCriterioDoNavegador());
  }, []);

  const voltarAoPadrao = useCallback(() => {
    document.cookie = cookieDoCriterio(null);
    setDoNavegador(lerCriterioDoNavegador());
  }, []);

  // A URL acompanha o cenário e a seleção do foco, sem empilhar histórico.
  const timerUrl = useRef<number | undefined>(undefined);
  const escreverUrl = useCallback(() => {
    const e = estadoRef.current;
    if (!e) return;
    const comCenario = escreverCenario(new URLSearchParams(window.location.search), e.cenario);
    const sel = e.selecoes[e.cenario.foco] ?? { obra: null, origem: "criterio" as const };
    window.history.replaceState(null, "", `${window.location.pathname}?${escreverSelecao(comCenario, sel)}`);
  }, []);
  const selecaoDoFoco = estado ? estado.selecoes[estado.cenario.foco] : undefined;
  useEffect(() => {
    if (!estado) return;
    window.clearTimeout(timerUrl.current);
    timerUrl.current = window.setTimeout(escreverUrl, 150);
    return () => window.clearTimeout(timerUrl.current);
  }, [estado, escreverUrl]);

  // Um pulso pelo caminho novo quando muda o foco ou a obra (e um ao abrir a página).
  const foco = estado?.cenario.foco;
  const obraDoFoco = selecaoDoFoco?.obra ?? null;
  const tocando = estado?.tocando ?? false;

  // O módulo segue a seleção do foco já assentada: a placa reage na hora, a obra não pisca.
  const resultadoDoFoco = estado?.resultados.find((r) => r.criterio.id === foco);
  const origemDoFoco =
    resultadoDoFoco?.ok && obraDoFoco ? origemDaEscolha(comoFoiEscolhida(resultadoDoFoco.resultado, selecaoDoFoco)) : null;
  const doModulo = useAssentado(
    { obra: obraDoFoco, origem: origemDoFoco },
    `${obraDoFoco}|${origemDoFoco}`,
    TROCA_DE_OBRA_MS,
    tocando,
  );
  useEffect(() => {
    if (foco) setPulso((n) => n + 1);
  }, [foco, obraDoFoco]);

  const timerCopia = useRef<number | undefined>(undefined);
  const copiarLink = async () => {
    window.clearTimeout(timerUrl.current);
    escreverUrl();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado("ok");
    } catch {
      setCopiado("erro");
    }
    window.clearTimeout(timerCopia.current);
    timerCopia.current = window.setTimeout(() => setCopiado(""), 2000);
  };
  useEffect(() => () => window.clearTimeout(timerCopia.current), []);

  if (!estado) return <p className={s.carregando}>Montando a placa…</p>;

  const { cenario, resultados, selecoes, memorias } = estado;
  const doFoco = resultados.find((r) => r.criterio.id === cenario.foco);
  const presetAtual = presetDoCenario(cenario);
  const resumo = resumoDoFoco(doFoco, selecaoDoFoco, rotuloDaObra);

  return (
    <div className={s.raiz}>
      <header className={s.cabecalho}>
        <div>
          <h1 className={s.titulo}>Simulador de critérios</h1>
          <p className={s.subtitulo}>Os cinco critérios lado a lado, no mesmo cenário. Página fora do menu do site.</p>
        </div>
        <div className={s.cabecalhoControles}>
          <label className={s.campoRotulado}>
            <span>Cenário</span>
            <select
              className={s.seletor}
              value={presetAtual ?? ""}
              data-preset={presetAtual ?? ""}
              onChange={(e) => {
                const p = PRESETS.find((x) => x.id === e.target.value);
                if (p) mudarCenario((c) => ({ ...p.cenario, foco: c.foco }));
              }}
            >
              {presetAtual === null ? (
                <option value="" disabled>
                  Personalizado
                </option>
              ) : null}
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={`${s.botao} ${s.botaoCopiar}`} onClick={copiarLink}>
            {copiado === "ok" ? "Copiado" : copiado === "erro" ? "Copie da barra de endereço" : "Copiar link do cenário"}
          </button>
        </div>
        <p className={s.resumo} aria-live="polite">
          {resumo}
        </p>
      </header>

      <PainelEntradas cenario={cenario} aoMudar={mudarCenario} />

      <Comparacao
        resultados={resultados}
        selecoes={selecoes}
        foco={cenario.foco}
        doNavegador={doNavegador}
        rotuloDaObra={rotuloDaObra}
        aoFocar={focar}
        aoUsarNoNavegador={usarNoNavegador}
        aoVoltarAoPadrao={voltarAoPadrao}
      >
        <NormalDeReferencia cenario={cenario} aoMudar={mudarCenario} />
      </Comparacao>

      <ZonaDaPlaca
        doFoco={doFoco}
        selecao={selecaoDoFoco}
        entrada={entradaEfetiva(cenario)}
        pulso={pulso}
        obrasNaMemoria={Object.keys(memorias[cenario.foco] ?? {}).length}
        aoEscolher={escolher}
        aoSortearDeNovo={sortearDeNovo}
        aoZerarMemoria={zerarMemoria}
      />

      <ModuloObra
        obra={doModulo.obra}
        origem={doModulo.origem}
        manifestos={manifestos}
        cenario={cenario}
        tocando={tocando}
        aoTocar={tocar}
        aoParar={parar}
        aoComecarObra={avancarRodizio}
      />
    </div>
  );
}
