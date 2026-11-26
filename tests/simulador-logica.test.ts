/**
 * Lógica pura do simulador: cenário na URL, seleção, troca de patch e canais.
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ENTRADAS, PRESETS, entradaEfetiva, escreverCenario, lerCenario, paraPropsDaObra } from "../app/[locale]/simulator/cenario";
import { escolherManual, escreverSelecao, lerSelecao, proximaSelecao } from "../app/[locale]/simulator/selecao";
import { decidirAcaoDePatch, patchDaObra } from "../app/[locale]/simulator/troca-de-patch";
import { canaisDoCenario } from "../app/[locale]/simulator/canais";
import { DECLARED_COMPOSITION_MANIFESTS } from "@/components/compositions/compositions-manifests.generated";
import type { ResultadoDeDecisao } from "../lib/criterios/tipos";

const limpo = PRESETS[0].cenario;

describe("cenário", () => {
  test("sem atributos na URL é o preset limpo e não veio da URL", () => {
    const { cenario, veioDaUrl } = lerCenario(new URLSearchParams("lat=1&lng=2&mode=x"));
    assert.equal(veioDaUrl, false);
    assert.deepEqual(cenario.valores.temperature, limpo.valores.temperature);
    assert.deepEqual({ ...cenario.valores, lat: 0, lon: 0 }, { ...limpo.valores, lat: 0, lon: 0 });
    assert.equal(cenario.foco, "atual");
  });

  test("lat e lng da URL entram nos valores", () => {
    const { cenario } = lerCenario(new URLSearchParams("lat=10&lng=20"));
    assert.equal(cenario.valores.lat, 10);
    assert.equal(cenario.valores.lon, 20);
  });

  test("ida e volta preserva tudo", () => {
    for (const p of PRESETS) {
      const url = escreverCenario(new URLSearchParams("obra=x"), p.cenario);
      const { cenario, veioDaUrl } = lerCenario(url);
      assert.equal(veioDaUrl, true);
      assert.deepEqual(cenario, p.cenario, p.id);
    }
  });

  test("clamp e valor não numérico", () => {
    const { cenario } = lerCenario(new URLSearchParams("temperature=999&rain=abc"));
    assert.equal(cenario.valores.temperature, 55);
    assert.equal(cenario.valores.rain, limpo.valores.rain);
  });

  test("closeFires é limitado por fireCount", () => {
    const { cenario } = lerCenario(new URLSearchParams("fireCount=3&closeFires=9"));
    assert.equal(cenario.valores.closeFires, 3);
    assert.equal(entradaEfetiva({ ...limpo, valores: { ...limpo.valores, fireCount: 2, closeFires: 8 } }).closeFires, 2);
  });

  test("escrever remove play e preserva o resto, com lng = lon", () => {
    const url = escreverCenario(new URLSearchParams("play=1&obra=curves&origem=manual&mode=x"), limpo);
    assert.equal(url.has("play"), false);
    assert.equal(url.get("obra"), "curves");
    assert.equal(url.get("origem"), "manual");
    assert.equal(url.get("mode"), "x");
    assert.equal(url.get("lng"), String(limpo.valores.lon));
    assert.equal(url.has("clima"), false);
  });

  test("indisponibilidade vira clima=0 / satelite=0 e valores null", () => {
    const c = { ...limpo, climaIndisponivel: true, sateliteIndisponivel: true };
    const url = escreverCenario(new URLSearchParams(), c);
    assert.equal(url.get("clima"), "0");
    assert.equal(url.get("satelite"), "0");
    const e = entradaEfetiva({ ...c, valores: { ...c.valores, fireCount: 5 } });
    for (const n of ["temperature", "humidity", "clouds", "rain", "windSpeed", "windDeg"] as const) assert.equal(e[n], null);
    for (const n of ["lightningCount", "fireCount", "closeFires"] as const) assert.equal(e[n], null);
    assert.equal(e.lat, c.valores.lat);
  });

  test("clima indisponível mantém as contagens", () => {
    const e = entradaEfetiva({ ...limpo, climaIndisponivel: true, valores: { ...limpo.valores, lightningCount: 4 } });
    assert.equal(e.temperature, null);
    assert.equal(e.lightningCount, 4);
  });

  test("os 10 presets são válidos dentro das faixas", () => {
    assert.equal(PRESETS.length, 10);
    assert.equal(PRESETS[0].id, "limpo");
    for (const p of PRESETS) {
      for (const e of ENTRADAS) {
        const v = p.cenario.valores[e.nome];
        assert.ok(v >= e.faixa[0] && v <= e.faixa[1], `${p.id}.${e.nome}`);
      }
      assert.ok(p.cenario.valores.closeFires <= p.cenario.valores.fireCount);
    }
  });

  test("paraPropsDaObra entrega só os atributos pedidos e disponíveis", () => {
    const c = { ...limpo, climaIndisponivel: true };
    assert.deepEqual(paraPropsDaObra(c, ["temperature", "lightningCount", "inexistente"]), { lightningCount: 0 });
  });
});

type Cand = { obra: string; probabilidade: number };
const resultado = (sorteio: "uniforme" | "ponderado" | "deterministico", cands: Cand[], escolha: string | null): ResultadoDeDecisao =>
  ({ sorteio, candidatas: cands, escolha } as unknown as ResultadoDeDecisao);
const sel = (obra: string, origem: "criterio" | "manual" = "criterio") => ({ obra, origem }) as never;

describe("seleção", () => {
  test("uniforme mantém a obra enquanto é candidata e troca quando sai", () => {
    const r1 = resultado("uniforme", [{ obra: "curves", probabilidade: 0.5 }, { obra: "lluvia", probabilidade: 0.5 }], "lluvia");
    assert.deepEqual(proximaSelecao(sel("curves"), r1), { obra: "curves", origem: "criterio" });
    const r2 = resultado("uniforme", [{ obra: "lluvia", probabilidade: 1 }, { obra: "curves", probabilidade: 0 }], "lluvia");
    assert.deepEqual(proximaSelecao(sel("curves"), r2), { obra: "lluvia", origem: "criterio" });
    assert.deepEqual(proximaSelecao(null, r1), { obra: "lluvia", origem: "criterio" });
  });

  test("determinístico segue a escolha", () => {
    const r = resultado("deterministico", [{ obra: "curves", probabilidade: 1 }, { obra: "lluvia", probabilidade: 0 }], "lluvia");
    assert.deepEqual(proximaSelecao(sel("curves"), r), { obra: "lluvia", origem: "criterio" });
  });

  test("manual vale enquanto é candidata", () => {
    const r = resultado("uniforme", [{ obra: "curves", probabilidade: 0.5 }, { obra: "lluvia", probabilidade: 0.5 }], "lluvia");
    assert.deepEqual(proximaSelecao(sel("curves", "manual"), r), sel("curves", "manual"));
    const fora = resultado("uniforme", [{ obra: "lluvia", probabilidade: 1 }], "lluvia");
    assert.deepEqual(proximaSelecao(sel("curves", "manual"), fora), { obra: "lluvia", origem: "criterio" });
  });

  test("manual determinístico vale se está na lista", () => {
    const r = resultado("deterministico", [{ obra: "curves", probabilidade: 0 }, { obra: "lluvia", probabilidade: 1 }], "lluvia");
    assert.deepEqual(proximaSelecao(sel("curves", "manual"), r), sel("curves", "manual"));
  });

  test("escolha manual fora das candidatas é ignorada", () => {
    const r = resultado("uniforme", [{ obra: "lluvia", probabilidade: 1 }], "lluvia");
    const antes = sel("lluvia");
    assert.equal(escolherManual(antes, r, "curves" as never), antes);
    assert.deepEqual(escolherManual(antes, r, "lluvia" as never), sel("lluvia", "manual"));
  });

  test("ler e escrever na URL", () => {
    const r = resultado("uniforme", [{ obra: "curves", probabilidade: 1 }], "curves");
    const url = escreverSelecao(new URLSearchParams("mode=x"), sel("curves", "manual"));
    assert.equal(url.get("mode"), "x");
    assert.deepEqual(lerSelecao(url, r), sel("curves", "manual"));
    assert.equal(escreverSelecao(url, sel("curves")).has("origem"), false);
    assert.equal(lerSelecao(new URLSearchParams("obra=nada"), r), null);
  });
});

describe("troca de patch", () => {
  const base = { desejado: "a", ativo: null, carregando: false, parando: false } as const;
  test("carregando ou parando espera", () => {
    assert.equal(decidirAcaoDePatch({ ...base, carregando: true }), "esperar");
    assert.equal(decidirAcaoDePatch({ ...base, ativo: "a", parando: true }), "esperar");
  });
  test("ativo diferente para; nada ativo inicia; desejado null para; igual nada", () => {
    assert.equal(decidirAcaoDePatch({ ...base, ativo: "b" }), "parar");
    assert.equal(decidirAcaoDePatch(base), "iniciar");
    assert.equal(decidirAcaoDePatch({ ...base, desejado: null, ativo: "b" }), "parar");
    assert.equal(decidirAcaoDePatch({ ...base, ativo: "a" }), "nada");
    assert.equal(decidirAcaoDePatch({ ...base, desejado: null }), "nada");
  });
  test("patchDaObra", () => {
    const m = DECLARED_COMPOSITION_MANIFESTS as unknown as Record<string, never>;
    assert.equal(patchDaObra("curves", m.curves), "mapa15");
    assert.equal(patchDaObra("cloudBubble", m.cloudBubble), "mapa15");
    assert.equal(patchDaObra("lluvia", m.lluvia), "bubble1");
    assert.equal(patchDaObra("lightningBolts", m.lightningBolts), "thunder4");
    assert.equal(patchDaObra("nightRain", m.nightRain), "rain2");
    assert.equal(patchDaObra("bonfire", m.bonfire), null);
  });
});

describe("canais", () => {
  const e = entradaEfetiva(limpo);
  test("só os canais que o patch recebe", () => {
    assert.deepEqual(canaisDoCenario(e, { "gaia.temp": "temp" }), [["temp", limpo.valores.temperature]]);
    assert.deepEqual(canaisDoCenario(e, {}), []);
  });
  test("valor null não é enviado", () => {
    const sem = entradaEfetiva({ ...limpo, climaIndisponivel: true });
    assert.deepEqual(canaisDoCenario(sem, { "gaia.temp": "temp", "gaia.lat": "lat" }), [["lat", limpo.valores.lat]]);
  });
});
