/**
 * Apresentação do simulador: textos, números em pt-BR, cores dos LEDs, cookie e caminho do pulso.
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  arredondarAoPasso,
  caminhoDaEscolha,
  casasDecimais,
  comDestaque,
  comoFoiEscolhida,
  cookieDoCriterio,
  corDoGrupo,
  formatarMs,
  formatarProbabilidade,
  formatarValor,
  lerCookie,
  lerNumero,
  nomeCurto,
  partirValor,
  presetDoCenario,
  quebrarEmLinhas,
  resumoDoFoco,
  rotuloDoCriterio,
  seloDaEscolha,
} from "../app/[locale]/simulator/apresentacao";
import { ENTRADAS, PRESETS, entradaEfetiva } from "../app/[locale]/simulator/cenario";
import { montarPlaca } from "../app/[locale]/simulator/layout-placa";
import { gerenciador } from "../lib/criterios/gerenciador";
import { catalogoHabilitado } from "../lib/criterios/catalogo";
import { lerIdDoCriterio } from "../lib/criterios/cookies";
import type { ResultadoDaComparacao } from "../lib/criterios/tipos";

const catalogo = catalogoHabilitado();
const SO_DA_OBRA = ENTRADAS.filter((e) => e.grupo === "obra").map((e) => e.nome);

function avaliar(presetId: string): ResultadoDaComparacao[] {
  const { cenario } = PRESETS.find((p) => p.id === presetId)!;
  return gerenciador.avaliarTodos(entradaEfetiva(cenario), () => ({
    catalogo,
    memoria: {},
    normal: null,
    sortear: () => 0.5,
  }));
}

const rotulo = (id: string) => catalogo.find((o) => o.id === id)?.label ?? id;

describe("nomes dos critérios", () => {
  test("o atual vira 0 e perde o prefixo repetido", () => {
    assert.equal(nomeCurto({ id: "atual", nome: "0 · Atual" }), "Atual");
    assert.equal(rotuloDoCriterio({ id: "atual", nome: "0 · Atual" }), "0 · Atual");
    assert.equal(rotuloDoCriterio({ id: "B", nome: "Dominante + rodízio" }), "B · Dominante + rodízio");
  });
});

describe("números em pt-BR", () => {
  test("ms com 2 casas e vírgula", () => {
    assert.equal(formatarMs(0.0234), "0,02 ms");
    assert.equal(formatarMs(12), "12,00 ms");
  });

  test("probabilidade em %, sem zero enganoso", () => {
    assert.equal(formatarProbabilidade(0.3333), "33%");
    assert.equal(formatarProbabilidade(0.001), "<1%");
    assert.equal(formatarProbabilidade(1), "100%");
  });

  test("casas do passo, formatação e leitura", () => {
    assert.equal(casasDecimais(0.5), 1);
    assert.equal(casasDecimais(0.01), 2);
    assert.equal(casasDecimais(5), 0);
    assert.equal(formatarValor(-23.55, 0.01), "-23,55");
    assert.equal(formatarValor(25, 0.5), "25");
    assert.equal(formatarValor(1500, 1), "1500");
    assert.equal(lerNumero("-23,5"), -23.5);
    assert.equal(lerNumero(" 4.4 "), 4.4);
    assert.equal(lerNumero("-"), null);
    assert.equal(lerNumero("abc"), null);
    assert.equal(arredondarAoPasso(0.30000000000000004, 0.1), 0.3);
    assert.equal(arredondarAoPasso(25.26, 0.5), 25.5);
  });
});

describe("escolha e resumo", () => {
  test("rodízio, sorteio e mão", () => {
    const [atual, , b] = avaliar("limpo");
    assert.ok(atual.ok && b.ok);
    const rb = b.resultado;
    assert.equal(seloDaEscolha(comoFoiEscolhida(rb, { obra: rb.escolha, origem: "criterio" })), "rodízio");
    const ra = atual.resultado;
    assert.equal(seloDaEscolha(comoFoiEscolhida(ra, { obra: ra.escolha, origem: "criterio" })), "9%");
    assert.equal(seloDaEscolha(comoFoiEscolhida(ra, { obra: ra.escolha, origem: "manual" })), "à mão");
    assert.equal(seloDaEscolha(comoFoiEscolhida(ra, undefined)), "");
  });

  test("o resumo do foco segue o exemplo do brief", () => {
    const b = avaliar("limpo")[2];
    assert.ok(b.ok);
    assert.equal(
      resumoDoFoco(b, { obra: "airports", origem: "criterio" }, rotulo),
      "Critério em foco: B · Dominante + rodízio. Vencedor: Calmaria. Obra: Airports, por rodízio.",
    );
  });

  test("um critério que falha aparece só como falha", () => {
    const [atual] = avaliar("limpo");
    const falha: ResultadoDaComparacao = { criterio: atual.criterio, ok: false, erro: "quebrou" };
    assert.equal(resumoDoFoco(falha, undefined, rotulo), "Critério em foco: 0 · Atual. O critério falhou: quebrou");
  });
});

describe("LEDs", () => {
  test("seis cores, só pelo grupo do fenômeno", () => {
    assert.equal(corDoGrupo("hydros"), "#4AA3FF");
    assert.equal(corDoGrupo("umido"), "#4AA3FF");
    assert.equal(corDoGrupo("calmaria"), "#F1E6C8");
    assert.equal(corDoGrupo("neve"), null);
    assert.equal(corDoGrupo(undefined), null);
  });
});

describe("placa", () => {
  test("o destaque vai para a obra selecionada, e só para ela", () => {
    const atual = avaliar("limpo")[0];
    assert.ok(atual.ok);
    const c = comDestaque(atual.resultado.circuito, "lluvia");
    const destacados = c.nos.filter((n) => n.destaque).map((n) => n.id);
    assert.deepEqual(destacados, ["obra:lluvia"]);
    assert.deepEqual(comDestaque(atual.resultado.circuito, null).nos.filter((n) => n.destaque), []);
  });

  test("o pulso percorre só trilhas energizadas até a obra e termina no J1", () => {
    const atual = avaliar("temporal")[0];
    assert.ok(atual.ok);
    const placa = montarPlaca(comDestaque(atual.resultado.circuito, "lluvia"), SO_DA_OBRA);
    const caminho = caminhoDaEscolha(placa.trilhas, placa.nos, "obra:lluvia");
    const porId = new Map(placa.trilhas.map((t) => [t.id, t]));
    assert.ok(caminho.length >= 4, `caminho curto: ${caminho.map((c) => c.id)}`);
    for (const { id } of caminho) {
      const t = porId.get(id)!;
      assert.ok(t.ativa && !t.direta, `${id} não devia pulsar`);
    }
    assert.ok(caminho.some((c) => c.id === "obra:lluvia->j1"));
    assert.ok(caminho.some((c) => c.etapa === 0), "o pulso começa nas entradas");
    assert.ok(!caminho.some((c) => c.id.includes("obra:zigzag")), "outra candidata não pulsa");
    assert.deepEqual(caminhoDaEscolha(placa.trilhas, placa.nos, null), []);
  });
});

describe("cenário e cookie", () => {
  test("cada preset se reconhece, e mexer num valor tira o reconhecimento", () => {
    for (const p of PRESETS) assert.equal(presetDoCenario({ ...p.cenario, foco: "C" }), p.id);
    const mexido = { ...PRESETS[0].cenario, valores: { ...PRESETS[0].cenario.valores, rain: 3 } };
    assert.equal(presetDoCenario(mexido), null);
  });

  test("gravar e apagar o critério deste navegador", () => {
    assert.equal(cookieDoCriterio("B"), "gaia_criterio=B; path=/; max-age=31536000; samesite=lax");
    assert.match(cookieDoCriterio(null), /^gaia_criterio=; path=\/; max-age=0; samesite=lax$/);
    assert.equal(lerIdDoCriterio(lerCookie("a=1; gaia_criterio=C; b=2", "gaia_criterio")), "C");
    assert.equal(lerCookie("gaia_criterio_x=1", "gaia_criterio"), null);
    assert.equal(lerIdDoCriterio(lerCookie("gaia_criterio=%E0%A4%A", "gaia_criterio")), null);
  });
});

describe("texto dos nós", () => {
  test("quebra pelas palavras", () => {
    assert.deepEqual(quebrarEmLinhas("maior saliência ≥ piso", 16), ["maior saliência", "≥ piso"]);
    assert.deepEqual(quebrarEmLinhas("Rodízio", 4), ["Rodízio"]);
    assert.deepEqual(quebrarEmLinhas("", 10), []);
  });

  test("o número vai para o display e o resto fica em texto", () => {
    assert.deepEqual(partirValor("42,5"), { numero: "42,5", resto: null });
    assert.deepEqual(partirValor("25,0 (piso)"), { numero: "25,0", resto: "piso" });
    assert.deepEqual(partirValor("-23.55"), { numero: "-23.55", resto: null });
    assert.deepEqual(partirValor("> 0 → +90"), { numero: null, resto: "> 0 → +90" });
    assert.deepEqual(partirValor("piso 0,25"), { numero: null, resto: "piso 0,25" });
  });
});
