import test from "node:test";
import assert from "node:assert/strict";
import {
  criarCicloDoModoAutomatico,
  PAUSA_ANTES_DO_PLAYER,
  PAUSA_NO_PLAYER,
  PAUSA_DE_VOLTA_AO_MAPA,
  type Agendador,
  type EtapasDoCiclo,
} from "../app/[locale]/map3/auto-mode-timers";

// Agendador falso: guarda os timers pendentes e deixa o teste dispará-los um
// a um, como um relógio manual.
function criarAgendadorFalso() {
  let proximoId = 1;
  const pendentes = new Map<number, { fn: () => void; ms: number }>();
  let cancelamentos = 0;

  const agendador: Agendador = {
    agendar: (fn, ms) => {
      const id = proximoId++;
      pendentes.set(id, { fn, ms });
      return id;
    },
    cancelar: (id) => {
      if (pendentes.delete(id as number)) cancelamentos++;
    },
  };

  function dispararProximo() {
    const [id, timer] = [...pendentes.entries()][0];
    pendentes.delete(id);
    timer.fn();
    return timer.ms;
  }

  return {
    agendador,
    dispararProximo,
    get pendentes() {
      return pendentes.size;
    },
    get cancelamentos() {
      return cancelamentos;
    },
  };
}

function etapasContadas() {
  const chamadas: string[] = [];
  const etapas: EtapasDoCiclo = {
    mostrarPlayer: () => chamadas.push("player"),
    voltarAoMapa: () => chamadas.push("mapa"),
    avancarDestino: () => chamadas.push("avancar"),
  };
  return { etapas, chamadas };
}

test("a cadeia completa executa as 3 etapas na ordem e com as pausas certas", () => {
  const relogio = criarAgendadorFalso();
  const ciclo = criarCicloDoModoAutomatico(relogio.agendador);
  const { etapas, chamadas } = etapasContadas();

  ciclo.iniciar(etapas);
  assert.equal(relogio.pendentes, 1);

  assert.equal(relogio.dispararProximo(), PAUSA_ANTES_DO_PLAYER);
  assert.deepEqual(chamadas, ["player"]);

  assert.equal(relogio.dispararProximo(), PAUSA_NO_PLAYER);
  assert.deepEqual(chamadas, ["player", "mapa"]);

  assert.equal(relogio.dispararProximo(), PAUSA_DE_VOLTA_AO_MAPA);
  assert.deepEqual(chamadas, ["player", "mapa", "avancar"]);

  assert.equal(relogio.pendentes, 0);
  assert.equal(ciclo.temCadeiaPendente, false);
});

test("nunca existe mais de um timer pendente, mesmo com moveends em rajada", () => {
  // Era o vazamento original: cada moveend do mapa (arrasto do visitante,
  // ajuste do flyTo) agendava uma cadeia nova sem cancelar a anterior.
  const relogio = criarAgendadorFalso();
  const ciclo = criarCicloDoModoAutomatico(relogio.agendador);
  const { etapas, chamadas } = etapasContadas();

  for (let i = 0; i < 10; i++) {
    ciclo.iniciar(etapas);
    assert.equal(relogio.pendentes, 1);
  }
  assert.equal(relogio.cancelamentos, 9);

  // A única cadeia sobrevivente roda até o fim, sozinha.
  relogio.dispararProximo();
  relogio.dispararProximo();
  relogio.dispararProximo();
  assert.deepEqual(chamadas, ["player", "mapa", "avancar"]);
  assert.equal(relogio.pendentes, 0);
});

test("reiniciar no meio da cadeia descarta o resto da cadeia antiga", () => {
  const relogio = criarAgendadorFalso();
  const ciclo = criarCicloDoModoAutomatico(relogio.agendador);
  const antiga = etapasContadas();
  const nova = etapasContadas();

  ciclo.iniciar(antiga.etapas);
  relogio.dispararProximo(); // player da cadeia antiga; t2 (20 s) fica pendente

  ciclo.iniciar(nova.etapas);
  assert.equal(relogio.pendentes, 1);

  relogio.dispararProximo();
  relogio.dispararProximo();
  relogio.dispararProximo();
  assert.deepEqual(antiga.chamadas, ["player"]);
  assert.deepEqual(nova.chamadas, ["player", "mapa", "avancar"]);
});

test("cancelar zera tudo em qualquer estágio da cadeia", () => {
  for (const estagio of [0, 1, 2]) {
    const relogio = criarAgendadorFalso();
    const ciclo = criarCicloDoModoAutomatico(relogio.agendador);
    const { etapas, chamadas } = etapasContadas();

    ciclo.iniciar(etapas);
    for (let i = 0; i < estagio; i++) relogio.dispararProximo();

    ciclo.cancelar();
    assert.equal(relogio.pendentes, 0, `estágio ${estagio}`);
    assert.equal(ciclo.temCadeiaPendente, false);
    assert.equal(chamadas.length, estagio);
  }
});

test("cancelar sem cadeia pendente é inofensivo", () => {
  const relogio = criarAgendadorFalso();
  const ciclo = criarCicloDoModoAutomatico(relogio.agendador);

  ciclo.cancelar();
  ciclo.cancelar();
  assert.equal(relogio.cancelamentos, 0);
});
