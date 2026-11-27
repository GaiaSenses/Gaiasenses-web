"use client";

/**
 * Painel das entradas do cenário: os 11 trimpots em três grupos (clima, satélite e o barramento
 * direto, que só a obra lê) e os dois interruptores de fonte indisponível. O normal de referência
 * do critério D mora junto da comparação, ao lado da linha que o usa.
 */
import type { NomeEntrada } from "@/lib/criterios/tipos";
import { CIDADES_DO_ESTUDO } from "@/lib/criterios/normais-do-estudo";
import { ENTRADAS, type Cenario } from "./cenario";
import { Interruptor } from "./interruptor";
import { Trimpot } from "./trimpot";
import s from "./simulador.module.css";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const DO_CLIMA: readonly NomeEntrada[] = ["temperature", "humidity", "clouds", "rain", "windSpeed"];
const DO_SATELITE: readonly NomeEntrada[] = ["lightningCount", "fireCount", "closeFires"];
const SO_DA_OBRA = ENTRADAS.filter((e) => e.grupo === "obra").map((e) => e.nome);

type Props = {
  cenario: Cenario;
  aoMudar: (f: (c: Cenario) => Cenario) => void;
};

export function PainelEntradas({ cenario, aoMudar }: Props) {
  const mudarValor = (nome: NomeEntrada, v: number) =>
    aoMudar((c) => {
      const valores = { ...c.valores, [nome]: v };
      // closeFires nunca passa de fireCount: baixar os focos puxa os próximos junto.
      valores.closeFires = Math.min(valores.closeFires, valores.fireCount);
      return { ...c, valores };
    });

  const trimpot = (nome: NomeEntrada) => {
    const e = ENTRADAS.find((x) => x.nome === nome)!;
    // A direção do vento vem da API do clima: cai junto com ela.
    const semFonte =
      (cenario.climaIndisponivel && (DO_CLIMA.includes(nome) || nome === "windDeg")) ||
      (cenario.sateliteIndisponivel && DO_SATELITE.includes(nome));
    return (
      <Trimpot
        key={nome}
        nome={nome}
        rotulo={e.rotulo}
        unidade={e.unidade}
        faixa={e.faixa}
        passo={e.passo}
        valor={cenario.valores[nome]}
        maximo={nome === "closeFires" ? cenario.valores.fireCount : undefined}
        dica={nome === "closeFires" ? "Até o total de focos" : undefined}
        desabilitado={semFonte}
        aoMudar={(v) => mudarValor(nome, v)}
      />
    );
  };

  return (
    <section className={`${s.zona} ${s.zonaEntradas}`} aria-labelledby="titulo-entradas">
      <h2 id="titulo-entradas" className={s.zonaTitulo}>
        Entradas
      </h2>

      <div className={s.grupo}>
        <div className={s.grupoCabeca}>
          <h3 className={s.grupoTitulo}>Clima</h3>
          <Interruptor
            id="clima"
            rotulo="Clima indisponível"
            ligado={cenario.climaIndisponivel}
            aoMudar={(v) => aoMudar((c) => ({ ...c, climaIndisponivel: v }))}
          />
        </div>
        <div className={s.grupoTrimpots}>{DO_CLIMA.map(trimpot)}</div>
      </div>

      <div className={s.grupo}>
        <div className={s.grupoCabeca}>
          <h3 className={s.grupoTitulo}>Satélite</h3>
          <Interruptor
            id="satelite"
            rotulo="Satélite indisponível"
            ligado={cenario.sateliteIndisponivel}
            aoMudar={(v) => aoMudar((c) => ({ ...c, sateliteIndisponivel: v }))}
          />
        </div>
        <div className={s.grupoTrimpots}>{DO_SATELITE.map(trimpot)}</div>
      </div>

      <div className={s.grupo}>
        <div className={s.grupoCabeca}>
          <h3 className={s.grupoTitulo}>Só a obra lê</h3>
          <span className={s.grupoNota}>Vão direto ao J1, sem passar pelos critérios</span>
        </div>
        <div className={s.grupoTrimpots}>{SO_DA_OBRA.map(trimpot)}</div>
      </div>
    </section>
  );
}

/** O normal de referência do critério D: cidade, mês e período (dia = 15 h, noite = 3 h). */
export function NormalDeReferencia({ cenario, aoMudar }: Props) {
  const ref = cenario.normalRef;
  const mudarRef = (parcial: Partial<Cenario["normalRef"]>) =>
    aoMudar((c) => ({ ...c, normalRef: { ...c.normalRef, ...parcial } }));

  return (
    <div className={`${s.grupo} ${s.grupoNormal}`} role="group" aria-labelledby="titulo-normal">
      <div className={s.grupoCabeca}>
        <h3 id="titulo-normal" className={s.grupoTitulo}>
          Normal de referência
        </h3>
        <span className={s.grupoNota}>Só o critério D usa</span>
      </div>
      <div className={s.normal}>
        <label className={s.campoRotulado}>
          <span>Cidade</span>
          <select
            className={s.seletor}
            value={ref.cidade}
            data-entrada="ref"
            onChange={(e) => mudarRef({ cidade: e.target.value })}
          >
            {CIDADES_DO_ESTUDO.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={s.campoRotulado}>
          <span>Mês</span>
          <select
            className={s.seletor}
            value={ref.mes}
            data-entrada="mes"
            onChange={(e) => mudarRef({ mes: Number(e.target.value) })}
          >
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <div className={s.periodo} role="radiogroup" aria-label="Período" data-entrada="periodo">
          {(["dia", "noite"] as const).map((p) => (
            <label key={p} className={s.periodoOpcao}>
              <input
                type="radio"
                name="periodo"
                value={p}
                checked={ref.periodo === p}
                onChange={() => mudarRef({ periodo: p })}
              />
              <span>{p === "dia" ? "Dia, 15 h" : "Noite, 3 h"}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
