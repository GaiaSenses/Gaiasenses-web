import test from "node:test";
import assert from "node:assert/strict";
import {
  lerLocalizacaoDoCookie,
  arredondarACelula,
  minimizarLocalizacao,
  TAMANHO_DA_CELULA_EM_GRAUS,
} from "../components/localizacao";

// ---------------------------------------------------------------------------
// T13 — cookie forjado nunca alcança o INSERT
// ---------------------------------------------------------------------------

test("cookie ausente ou vazio cai no fallback", () => {
  assert.equal(lerLocalizacaoDoCookie(undefined), null);
  assert.equal(lerLocalizacaoDoCookie(""), null);
});

test("cookie legítimo de produção: request.geo do Vercel entrega STRINGS", () => {
  assert.deepEqual(
    lerLocalizacaoDoCookie(JSON.stringify({ lat: "-23.5528381", lng: "-46.6621533" })),
    { lat: -23.5528381, lng: -46.6621533 },
  );
});

test("cookie legítimo de desenvolvimento: fallback do middleware usa números", () => {
  assert.deepEqual(
    lerLocalizacaoDoCookie(JSON.stringify({ lat: -23.5528381, lng: -46.6621533 })),
    { lat: -23.5528381, lng: -46.6621533 },
  );
});

test("JSON quebrado, tipos errados e shape errado são rejeitados", () => {
  for (const forjado of [
    "não é json",
    '"uma string"',
    "42",
    "null",
    "[1,2]",
    "{}",
    JSON.stringify({ lat: -23.55 }), // lng faltando
    JSON.stringify({ lat: true, lng: -46.66 }),
    JSON.stringify({ lat: { valor: -23.55 }, lng: -46.66 }),
    JSON.stringify({ lat: "abc", lng: "-46.66" }),
    JSON.stringify({ lat: "", lng: "-46.66" }),
    JSON.stringify({ lat: "Infinity", lng: "-46.66" }),
    JSON.stringify({ lat: null, lng: -46.66 }),
  ]) {
    assert.equal(lerLocalizacaoDoCookie(forjado), null, `aceitou: ${forjado}`);
  }
});

test("faixa impossível é rejeitada; os limites exatos passam", () => {
  assert.equal(lerLocalizacaoDoCookie(JSON.stringify({ lat: 90.0001, lng: 0 })), null);
  assert.equal(lerLocalizacaoDoCookie(JSON.stringify({ lat: -90.0001, lng: 0 })), null);
  assert.equal(lerLocalizacaoDoCookie(JSON.stringify({ lat: 0, lng: 180.0001 })), null);
  assert.equal(lerLocalizacaoDoCookie(JSON.stringify({ lat: 0, lng: -180.0001 })), null);
  assert.equal(lerLocalizacaoDoCookie(JSON.stringify({ lat: "9999", lng: "0" })), null);

  assert.deepEqual(lerLocalizacaoDoCookie(JSON.stringify({ lat: 90, lng: -180 })), {
    lat: 90,
    lng: -180,
  });
  assert.deepEqual(lerLocalizacaoDoCookie(JSON.stringify({ lat: -90, lng: 180 })), {
    lat: -90,
    lng: 180,
  });
});

test("payload extra num cookie forjado morre na leitura: só lat/lng saem", () => {
  const lido = lerLocalizacaoDoCookie(
    JSON.stringify({
      lat: -23.55,
      lng: -46.66,
      injecao: "<script>alert(1)</script>",
      timeSpent: 999999,
    }),
  );
  assert.deepEqual(lido, { lat: -23.55, lng: -46.66 });
});

// ---------------------------------------------------------------------------
// T14 — coordenada gravada é a célula (~4 km), não a casa do visitante
// ---------------------------------------------------------------------------

test("arredonda para o centro de célula mais próximo, sem ruído binário", () => {
  assert.equal(arredondarACelula(-23.5505), -23.56);
  assert.equal(arredondarACelula(-46.6333), -46.64);
  assert.equal(arredondarACelula(0), 0);
  assert.equal(arredondarACelula(-23.56), -23.56); // múltiplo exato não se move
});

test("o deslocamento introduzido nunca passa de meia célula (~2,2 km)", () => {
  for (let i = 0; i < 1000; i++) {
    const grau = -90 + (i / 999) * 180;
    const desvio = Math.abs(arredondarACelula(grau) - grau);
    assert.ok(
      desvio <= TAMANHO_DA_CELULA_EM_GRAUS / 2 + 1e-9,
      `desvio ${desvio} em ${grau}`,
    );
  }
});

test("minimizar é idempotente: a célula da célula é ela mesma", () => {
  const uma = minimizarLocalizacao({ lat: -22.851692, lng: -47.127688 });
  assert.deepEqual(minimizarLocalizacao(uma), uma);
});

test("duas visitas na mesma vizinhança caem na mesma célula", () => {
  const casa = minimizarLocalizacao({ lat: -23.5501, lng: -46.6601 });
  const padaria = minimizarLocalizacao({ lat: -23.5512, lng: -46.6613 });
  assert.deepEqual(casa, padaria);
});
