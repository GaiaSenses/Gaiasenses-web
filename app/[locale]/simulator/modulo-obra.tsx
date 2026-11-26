"use client";

/**
 * Módulo da obra (D3.6): a obra escolhida pelo critério em foco, ao vivo, com o som de verdade e
 * os valores do cenário.
 *
 * - A obra só monta depois de "Tocar obra" (o gesto do usuário); "Parar" a desmonta.
 * - O canvas das obras tem o tamanho da viewport (`lib/p5-canvas-fit.ts`), e não o do pai. Então
 *   a obra vive num "monitor" do tamanho da viewport, reduzido por CSS `scale` para caber aqui;
 *   "Tela cheia" põe o monitor na tela inteira, sem redução.
 * - Remonta cerca de 500 ms depois que assenta o valor de um atributo que ELA declara; o mp3 e o
 *   patch ficam fora da `key` e seguem tocando.
 * - airports: um escudo `onClickCapture` não deixa o clique chegar ao botão interno do `Discrete`,
 *   que reescreveria a URL para o mapa.
 * - Nunca monta `DataSender` nem `CompositionControls`.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from "react";
import type { DeclaredCompositionName } from "@/components/compositions/compositions-manifests.generated";
import type { DECLARED_COMPOSITION_MANIFESTS } from "@/components/compositions/compositions-manifests.generated";
import type { CompositionManifest } from "@/components/compositions/composition-audio";
import { CLIENT_SKETCHES } from "@/components/compositions/compositions-client.generated";
import Player from "@/components/compositions/my-player";
import { tamanhoDaTela } from "@/lib/p5-canvas-fit";
import { entradaEfetiva, paraPropsDaObra, type Cenario } from "./cenario";
import { audioDaObra, chaveDaObra, escalaDoMonitor, legendaDoAudio, patchNaoLeOClima } from "./modulo";
import { useAssentado } from "./use-assentado";
import { useAudioDaObra } from "./use-audio-da-obra";
import s from "./simulador.module.css";

/** Quanto um atributo da obra fica parado antes de ela remontar com o valor novo. */
const REMONTAGEM_MS = 500;

type Props = {
  /** A obra do critério em foco, já assentada (o simulador faz o debounce da troca). */
  obra: DeclaredCompositionName | null;
  /** "por sorteio", "por rodízio" ou "à mão". */
  origem: string | null;
  manifestos: typeof DECLARED_COMPOSITION_MANIFESTS;
  cenario: Cenario;
  tocando: boolean;
  aoTocar: () => void;
  aoParar: () => void;
  /** A obra começou a tocar (no Tocar ou numa troca com o som ligado): avança o rodízio. */
  aoComecarObra: (obra: DeclaredCompositionName) => void;
};

/** O tamanho da viewport, que é o do canvas das obras; acompanha a janela. */
function useTamanhoDaTela(): { largura: number; altura: number } {
  const [tela, setTela] = useState(tamanhoDaTela);
  useEffect(() => {
    const medir = () =>
      setTela((t) => {
        const n = tamanhoDaTela();
        return n.largura === t.largura && n.altura === t.altura ? t : n;
      });
    const observador = new ResizeObserver(medir);
    observador.observe(document.documentElement);
    window.addEventListener("resize", medir);
    medir();
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);
  return tela;
}

/** A caixa disponível para a tela do módulo (a largura da coluna e, quando há, a altura). */
function useCaixa(ref: RefObject<HTMLDivElement>): { largura: number; altura: number } {
  const [caixa, setCaixa] = useState({ largura: 0, altura: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () =>
      setCaixa((c) => {
        const largura = el.clientWidth;
        const altura = el.clientHeight;
        return c.largura === largura && c.altura === altura ? c : { largura, altura };
      });
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    medir();
    return () => observador.disconnect();
  }, [ref]);
  return caixa;
}

/** O clique dentro do airports não chega ao `TogglePlayButton` do `Discrete`. */
function blindar(e: MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
}

function Obra({ obra, props }: { obra: DeclaredCompositionName; props: Record<string, number> }) {
  const Sketch = CLIENT_SKETCHES[obra];
  if (obra === "airports") {
    return (
      <div className={s.obraCaixa} onClickCapture={blindar} data-escudo="">
        <Sketch {...props} play />
      </div>
    );
  }
  return (
    <div className={s.obraCaixa}>
      <Sketch {...props} play />
    </div>
  );
}

export function ModuloObra({ obra, origem, manifestos, cenario, tocando, aoTocar, aoParar, aoComecarObra }: Props) {
  const manifesto = obra ? (manifestos[obra] as CompositionManifest) : null;
  const atributos = manifesto?.attributes ?? [];
  const props = paraPropsDaObra(cenario, atributos);
  const chave = obra ? chaveDaObra(obra, atributos, props) : "";
  // Os valores que a obra recebe só mudam quando assentam, junto com a remontagem; a troca de
  // obra (que já veio com debounce) leva os valores dela na hora.
  const propsAssentadas = useAssentado(props, chave, REMONTAGEM_MS, tocando, obra ?? "");
  const chaveAssentada = obra ? chaveDaObra(obra, atributos, propsAssentadas) : "";

  const audio = obra && manifesto ? audioDaObra(obra, manifesto, propsAssentadas) : null;
  const { estadoDoPatch } = useAudioDaObra({ obra, manifesto, tocando, entrada: entradaEfetiva(cenario) });
  const montada = tocando && obra !== null;

  // Tocar, ou trocar de obra com o som ligado: o rodízio do critério em foco avança.
  const avisar = useRef(aoComecarObra);
  useLayoutEffect(() => {
    avisar.current = aoComecarObra;
  });
  useEffect(() => {
    if (tocando && obra) avisar.current(obra);
  }, [tocando, obra]);

  // O monitor: do tamanho da viewport, reduzido para caber na área do módulo.
  const tela = useTamanhoDaTela();
  const refDaArea = useRef<HTMLDivElement>(null);
  const area = useCaixa(refDaArea);
  const escala = escalaDoMonitor(area, tela);
  const monitorRef = useRef<HTMLDivElement>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  useEffect(() => {
    const aoMudar = () => setTelaCheia(document.fullscreenElement !== null && document.fullscreenElement === monitorRef.current);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);
  // Sem obra montada, a tela cheia não tem o que mostrar.
  useEffect(() => {
    if (!montada && document.fullscreenElement && document.fullscreenElement === monitorRef.current) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [montada]);
  const pedirTelaCheia = () => {
    void monitorRef.current?.requestFullscreen().catch(() => undefined);
  };
  const [podeTelaCheia, setPodeTelaCheia] = useState(false);
  useEffect(() => setPodeTelaCheia(document.fullscreenEnabled), []);

  const estiloDaArea = { "--proporcao": `${tela.largura || 16} / ${tela.altura || 9}` } as CSSProperties;
  const estiloDaTela: CSSProperties = { width: tela.largura * escala, height: tela.altura * escala };
  const estiloDoMonitor: CSSProperties | undefined = telaCheia
    ? undefined
    : { width: tela.largura, height: tela.altura, transform: `scale(${escala})` };

  return (
    <aside
      className={`${s.zona} ${s.zonaModulo}`}
      aria-labelledby="titulo-modulo"
      data-modulo-obra={montada ? "tocando" : "parado"}
      data-obra={obra ?? ""}
    >
      <h2 id="titulo-modulo" className={s.zonaTitulo}>
        Módulo da obra
      </h2>
      <div className={s.modulo}>
        <div ref={refDaArea} className={s.moduloArea} style={estiloDaArea}>
          <div className={s.moduloTela} style={estiloDaTela}>
            <div ref={monitorRef} className={s.monitor} style={estiloDoMonitor} data-monitor="">
              {montada ? <Obra key={chaveAssentada} obra={obra} props={propsAssentadas} /> : null}
            </div>
            {montada ? null : (
              <p className={s.monitorDesligado}>{obra ? "A obra aparece aqui ao tocar." : "Nenhuma obra candidata."}</p>
            )}
          </div>
        </div>

        <div className={s.moduloLegenda}>
          {manifesto ? (
            <>
              <p className={s.moduloObra}>{manifesto.label}</p>
              {manifesto.author ? <p className={s.moduloAutor}>{manifesto.author}</p> : null}
            </>
          ) : (
            <p className={s.moduloObra}>Nenhuma obra candidata</p>
          )}
          {audio ? (
            <dl className={s.moduloFicha}>
              <div>
                <dt>Som</dt>
                <dd data-audio="">{legendaDoAudio(audio, tocando ? estadoDoPatch : null)}</dd>
              </div>
              {origem ? (
                <div>
                  <dt>Escolha</dt>
                  <dd data-origem="">{origem}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {audio && patchNaoLeOClima(audio.patch) ? (
            <p className={s.moduloAviso} data-aviso-clima="">
              o patch não lê o clima
            </p>
          ) : null}
          <div className={s.moduloBotoes}>
            <button type="button" className={s.botao} onClick={aoTocar} disabled={!obra || tocando}>
              Tocar obra
            </button>
            <button type="button" className={s.botaoSecundario} onClick={aoParar} disabled={!tocando}>
              Parar
            </button>
            <button
              type="button"
              className={s.botaoSecundario}
              onClick={pedirTelaCheia}
              disabled={!montada || !podeTelaCheia}
            >
              Tela cheia
            </button>
          </div>
        </div>
      </div>
      {/* O mp3 fica fora da `key` da obra: remontar a obra não reinicia o som. */}
      {montada && audio?.mp3 ? (
        <div hidden>
          <Player path={audio.mp3} play />
        </div>
      ) : null}
    </aside>
  );
}
