// A cadeia de timers do passeio automático (mapa → player → mapa → próximo
// destino) vive aqui, fora do React, para poder ser testada com um agendador
// injetado. A invariante que este módulo garante: NUNCA existe mais de uma
// cadeia pendente — iniciar de novo cancela a anterior, e cancelar() zera tudo.
// Sem isso, cada moveend extra do mapa (arrasto do visitante, ajuste do flyTo)
// abria uma cadeia paralela, e uma sessão longa de exposição acumulava timers
// disparando router.replace uns por cima dos outros.

export const PAUSA_ANTES_DO_PLAYER = 5000;
export const PAUSA_NO_PLAYER = 20000;
export const PAUSA_DE_VOLTA_AO_MAPA = 5000;

export type Agendador = {
  agendar: (fn: () => void, ms: number) => unknown;
  cancelar: (id: unknown) => void;
};

export type EtapasDoCiclo = {
  mostrarPlayer: () => void;
  voltarAoMapa: () => void;
  avancarDestino: () => void;
};

const agendadorPadrao: Agendador = {
  agendar: (fn, ms) => setTimeout(fn, ms),
  cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function criarCicloDoModoAutomatico(
  agendador: Agendador = agendadorPadrao,
) {
  let pendente: unknown = null;

  function cancelar() {
    if (pendente !== null) {
      agendador.cancelar(pendente);
      pendente = null;
    }
  }

  function iniciar(etapas: EtapasDoCiclo) {
    cancelar();
    pendente = agendador.agendar(() => {
      etapas.mostrarPlayer();
      pendente = agendador.agendar(() => {
        etapas.voltarAoMapa();
        pendente = agendador.agendar(() => {
          pendente = null;
          etapas.avancarDestino();
        }, PAUSA_DE_VOLTA_AO_MAPA);
      }, PAUSA_NO_PLAYER);
    }, PAUSA_ANTES_DO_PLAYER);
  }

  return {
    iniciar,
    cancelar,
    get temCadeiaPendente() {
      return pendente !== null;
    },
  };
}

export type CicloDoModoAutomatico = ReturnType<
  typeof criarCicloDoModoAutomatico
>;
