"use client";

/**
 * Comparação (D3.4): uma linha por critério, na ordem de registro. Clicar na linha a põe em foco;
 * a linha em foco ganha as ações do cookie deste navegador. Uma linha que falhou mostra o erro só
 * nela.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CRITERIO_PADRAO_ID } from "@/lib/criterios/gerenciador";
import type { IdCriterio, ResultadoDaComparacao } from "@/lib/criterios/tipos";
import { comoFoiEscolhida, formatarMs, idCurto, seloDaEscolha } from "./apresentacao";
import type { Selecao } from "./selecao";
import s from "./simulador.module.css";

type Props = {
  resultados: readonly ResultadoDaComparacao[];
  selecoes: Partial<Record<IdCriterio, Selecao>>;
  foco: IdCriterio;
  /** O critério do cookie `gaia_criterio` deste navegador, já validado. */
  doNavegador: IdCriterio | null;
  rotuloDaObra: (id: string) => string;
  aoFocar: (id: IdCriterio) => void;
  aoUsarNoNavegador: (id: IdCriterio) => void;
  aoVoltarAoPadrao: () => void;
  /** Rodapé da zona (o normal de referência do D). */
  children?: ReactNode;
};

export function Comparacao({
  resultados,
  selecoes,
  foco,
  doNavegador,
  rotuloDaObra,
  aoFocar,
  aoUsarNoNavegador,
  aoVoltarAoPadrao,
  children,
}: Props) {
  return (
    <section className={`${s.zona} ${s.zonaComparacao}`} aria-labelledby="titulo-comparacao">
      <h2 id="titulo-comparacao" className={s.zonaTitulo}>
        Comparação
      </h2>
      <div className={s.tabela}>
        <div className={s.tabelaCabeca} aria-hidden="true">
          <span />
          <span>Critério</span>
          <span>Vencedor</span>
          <span>Obra</span>
          <span className={s.numero}>Tempo</span>
        </div>
        <ul className={s.linhas}>
          {resultados.map((rc) => {
            const id = rc.criterio.id;
            const emFoco = id === foco;
            const padrao = id === CRITERIO_PADRAO_ID;
            const sel = selecoes[id];
            return (
              <li
                key={id}
                className={s.linha}
                data-criterio={id}
                data-foco={emFoco ? "true" : "false"}
                data-padrao={padrao ? "true" : "false"}
                onClick={() => aoFocar(id)}
              >
                <button type="button" className={s.linhaBotao} aria-pressed={emFoco}>
                  <span className={s.pad} aria-hidden="true" />
                  <span className={s.celCriterio}>
                    <span className={s.criterioNome}>
                      <span className={s.criterioId}>{idCurto(id)}</span> · {rc.criterio.nome}
                      {/* espaço sem quebra: a versão não fica sozinha na segunda linha */}
                      {`\u00a0·\u00a0v${rc.criterio.versao}`}
                    </span>
                    {padrao || doNavegador === id ? (
                      <span className={s.selos}>
                        {padrao ? <span className={s.selo}>padrão do site</span> : null}
                        {doNavegador === id ? (
                          <span className={`${s.selo} ${s.seloNavegador}`}>neste navegador</span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                  {rc.ok ? (
                    <>
                      <span className={s.celTexto} title={rc.resultado.vencedor.rotulo}>
                        {rc.resultado.vencedor.rotulo}
                      </span>
                      <span className={s.celTexto}>
                        {sel?.obra ? (
                          <>
                            {rotuloDaObra(sel.obra)}{" "}
                            <span className={s.celSelo}>{seloDaEscolha(comoFoiEscolhida(rc.resultado, sel))}</span>
                          </>
                        ) : (
                          <span className={s.celSelo}>nenhuma candidata</span>
                        )}
                      </span>
                      <span className={`${s.numero} ${s.celMs}`}>{formatarMs(rc.resultado.duracaoMs)}</span>
                    </>
                  ) : (
                    <span className={s.celErro}>O critério falhou: {rc.erro}</span>
                  )}
                </button>
                {rc.ok ? <Motivo texto={rc.resultado.motivo} /> : null}
                {emFoco ? (
                  <div className={s.acoes}>
                    <button
                      type="button"
                      className={s.botao}
                      disabled={doNavegador === id}
                      onClick={() => aoUsarNoNavegador(id)}
                    >
                      Usar este critério neste navegador
                    </button>
                    <button
                      type="button"
                      className={s.botaoSecundario}
                      disabled={doNavegador === null}
                      onClick={aoVoltarAoPadrao}
                    >
                      Voltar ao padrão neste navegador
                    </button>
                    {/* O /map3 não tem o normal do lugar para dar a quem o usa (o D). */}
                    {rc.criterio.usaNormal ? (
                      <p className={s.acoesNota}>No site, sem normal do lugar: age como o B.</p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      {children}
    </section>
  );
}

/** O motivo numa linha só; o controle de abrir aparece quando o texto não cabe. */
function Motivo({ texto }: { texto: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [aberto, setAberto] = useState(false);
  const [cortado, setCortado] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || aberto) return;
    const medir = () => setCortado(el.scrollWidth > el.clientWidth + 1);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [texto, aberto]);

  return (
    <div className={s.motivo}>
      <p ref={ref} className={aberto ? s.motivoAberto : s.motivoFechado}>
        {texto}
      </p>
      {cortado || aberto ? (
        <button
          type="button"
          className={s.motivoBotao}
          aria-expanded={aberto}
          onClick={(e) => {
            e.stopPropagation();
            setAberto((a) => !a);
          }}
        >
          {aberto ? "Ver menos" : "Ver motivo inteiro"}
        </button>
      ) : null}
    </div>
  );
}
