/**
 * Produção (`/map3`): a entrada do site, os cookies do critério de teste e a prova de que,
 * sem cookie, a escolha é a mesma de hoje (894a0ac).
 * Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { paraEntradaClima } from "@/lib/criterios/entrada-do-site";
import {
  COOKIE_CRITERIO,
  IDS_REGISTRADOS,
  UM_ANO_EM_SEGUNDOS,
  cookieDoCriterio,
  cookieDoRodizio,
  escreverMemoria,
  lerCookie,
  lerIdDoCriterio,
  lerMemoria,
  textoDoCookie,
} from "@/lib/criterios/cookies";
import { escolherObraDoSite } from "@/lib/criterios/escolha-do-site";
import { GerenciadorDeCriterios, gerenciador } from "@/lib/criterios/gerenciador";
import { CriterioAtual } from "@/lib/criterios/criterio-atual";
import { CriterioDeDecisao } from "@/lib/criterios/criterio-de-decisao";
import { catalogoHabilitado } from "@/lib/criterios/catalogo";
import type { Calculo, EntradaClima, NomeEntrada } from "@/lib/criterios/tipos";
import { getCompositionDecisionTrace } from "./fixtures/criterio-producao";
import { climaDaPaginaEm894a0ac } from "./fixtures/clima-da-pagina";

const catalogo = catalogoHabilitado();

function mulberry32(semente: number): () => number {
  let a = semente;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clima no formato que `getWeather` devolve (`toRainfallResponse`). */
const tempo = (parcial: {
  temp?: number; humidity?: number; clouds?: number; speed?: number; deg?: number;
  rain?: { "1h"?: number };
} = {}) => ({
  city: "Open Weather API",
  clouds: parcial.clouds ?? 40,
  lat: 0,
  lon: 0,
  main: { feels_like: 0, grnd_level: 0, humidity: parcial.humidity ?? 60, pressure: 1000, temp: parcial.temp ?? 22 },
  rain: parcial.rain ?? { "1h": 0 },
  state: "Open weather API",
  visibility: 0,
  weather: [{ description: "", icon: "", main: "" }],
  wind: { deg: parcial.deg ?? 180, gust: 5, speed: parcial.speed ?? 3 },
});

const focos = (distancias: number[]) => ({
  city: "", state: "", count: distancias.length,
  events: distancias.map((dist) => ({ dist, lat: 0, lon: 0 })),
});

describe("paraEntradaClima", () => {
  test("lê cada fonte no vocabulário dos critérios", () => {
    const e = paraEntradaClima({
      weatherData: tempo({ temp: 31.5, humidity: 80, clouds: 75, speed: 4.2, deg: 270, rain: { "1h": 1.2 } }),
      lightningData: { city: "", state: "", count: 3, events: [] },
      fireSpotsData: focos([10, 49.9, 50, 80]),
      lat: -22.9,
      lng: -47.06,
    });
    assert.deepEqual(e, {
      temperature: 31.5, humidity: 80, clouds: 75, rain: 1.2, windSpeed: 4.2, windDeg: 270,
      lightningCount: 3, fireCount: 4, closeFires: 2, lat: -22.9, lon: -47.06,
    } satisfies EntradaClima);
  });

  test("NaN e undefined viram null", () => {
    const e = paraEntradaClima({
      weatherData: tempo({ temp: NaN, humidity: NaN, clouds: NaN, speed: NaN, deg: NaN, rain: { "1h": NaN } }),
      lightningData: { city: "", state: "", count: NaN, events: [] },
      fireSpotsData: { ...focos([]), count: undefined as unknown as number },
      lat: NaN,
      lng: NaN,
    });
    for (const [nome, valor] of Object.entries(e)) {
      if (nome === "closeFires") continue;
      assert.equal(valor, null, nome);
    }

    const semChuva = paraEntradaClima({
      weatherData: tempo({ rain: {} }), lightningData: null, fireSpotsData: null, lat: 0, lng: 0,
    });
    assert.equal(semChuva.rain, null);
  });

  test("fontes indisponíveis viram null, e 0 continua 0", () => {
    const fora = paraEntradaClima({
      weatherData: undefined, lightningData: null, fireSpotsData: null, lat: 1, lng: 2,
    });
    assert.deepEqual(fora, {
      temperature: null, humidity: null, clouds: null, rain: null, windSpeed: null, windDeg: null,
      lightningCount: null, fireCount: null, closeFires: null, lat: 1, lon: 2,
    });

    const calmo = paraEntradaClima({
      weatherData: tempo({ temp: 0, humidity: 0, clouds: 0, speed: 0, deg: 0, rain: { "1h": 0 } }),
      lightningData: { city: "", state: "", count: 0, events: [] },
      fireSpotsData: focos([]),
      lat: 0,
      lng: 0,
    });
    assert.ok(Object.values(calmo).every((v) => v === 0));
  });

  test("closeFires conta os eventos com dist < 50", () => {
    const contar = (fireSpotsData: unknown) =>
      paraEntradaClima({ weatherData: null, lightningData: null, fireSpotsData: fireSpotsData as never, lat: 0, lng: 0 })
        .closeFires;
    assert.equal(contar(focos([0, 12, 49.99])), 3);
    assert.equal(contar(focos([50, 50.01, 99])), 0);
    assert.equal(contar(focos([])), 0);
    // `dist` ausente ou inválido não conta como perto.
    assert.equal(contar({ count: 2, events: [{ lat: 0, lon: 0 }, { dist: NaN, lat: 0, lon: 0 }] }), 0);
    // Sem lista de eventos não dá para saber: null, não 0.
    assert.equal(contar({ count: 2 }), null);
  });
});

describe("cookies do critério de teste", () => {
  test("nomes dos cookies", () => {
    assert.equal(COOKIE_CRITERIO, "gaia_criterio");
    assert.equal(cookieDoRodizio("B"), "gaia_rodizio_B");
  });

  test("lerIdDoCriterio aceita só ids registrados", () => {
    assert.equal(lerIdDoCriterio("B"), "B");
    assert.equal(lerIdDoCriterio("atual"), "atual");
    assert.equal(lerIdDoCriterio("../x"), null);
    assert.equal(lerIdDoCriterio("a".repeat(40)), null);
    assert.equal(lerIdDoCriterio(""), null);
    assert.equal(lerIdDoCriterio(undefined), null);
    assert.equal(lerIdDoCriterio("b"), null);
    assert.equal(lerIdDoCriterio("__proto__"), null);
  });

  test("a lista de ids aceitos é a do gerenciador", () => {
    assert.deepEqual(IDS_REGISTRADOS, gerenciador.listar().map((c) => c.id));
  });

  test("lerCookie acha o par exato, com ou sem espaço, e decodifica", () => {
    assert.equal(lerCookie("a=1; gaia_criterio=C; b=2", COOKIE_CRITERIO), "C");
    assert.equal(lerCookie("a=1;gaia_criterio=C;b=2", COOKIE_CRITERIO), "C");
    assert.equal(lerCookie("gaia_criterio=C", COOKIE_CRITERIO), "C");
    assert.equal(lerCookie("gaia_rodizio_B=%7B%22lluvia%22%3A1%7D", cookieDoRodizio("B")), '{"lluvia":1}');
    // Um nome que só começa igual não conta.
    assert.equal(lerCookie("gaia_criterio_x=1", COOKIE_CRITERIO), null);
    assert.equal(lerCookie("x_gaia_criterio=1", COOKIE_CRITERIO), null);
    assert.equal(lerCookie("", COOKIE_CRITERIO), null);
    assert.equal(lerCookie("sem-igual; outro", COOKIE_CRITERIO), null);
    // Codificação quebrada vira null, e o id inválido daí vira o padrão.
    assert.equal(lerCookie("gaia_criterio=%E0%A4%A", COOKIE_CRITERIO), null);
    assert.equal(lerIdDoCriterio(lerCookie("gaia_criterio=%E0%A4%A", COOKIE_CRITERIO)), null);
  });

  test("textoDoCookie grava codificado, com path, validade e SameSite=Lax", () => {
    const valor = escreverMemoria({}, "lluvia", 1795000000);
    const texto = textoDoCookie(cookieDoRodizio("B"), valor, UM_ANO_EM_SEGUNDOS);
    assert.equal(texto, `gaia_rodizio_B=${encodeURIComponent(valor)}; path=/; max-age=31536000; samesite=lax`);
    // Ida e volta: o par que o navegador guardaria lê de volta o mesmo valor.
    assert.equal(lerCookie(texto.split(";")[0], cookieDoRodizio("B")), valor);
    assert.equal(textoDoCookie("x", "", 0), "x=; path=/; max-age=0; samesite=lax");
  });

  test("gravar e apagar o critério deste navegador", () => {
    assert.equal(cookieDoCriterio("B"), "gaia_criterio=B; path=/; max-age=31536000; samesite=lax");
    assert.equal(cookieDoCriterio(null), "gaia_criterio=; path=/; max-age=0; samesite=lax");
    assert.equal(lerIdDoCriterio(lerCookie(cookieDoCriterio("C").split(";")[0], COOKIE_CRITERIO)), "C");
  });

  test("lerMemoria: lixo vira memória vazia", () => {
    assert.deepEqual(lerMemoria(undefined, catalogo), {});
    assert.deepEqual(lerMemoria("", catalogo), {});
    assert.deepEqual(lerMemoria("{não é json", catalogo), {});
    assert.deepEqual(lerMemoria("[1,2]", catalogo), {});
    assert.deepEqual(lerMemoria("null", catalogo), {});
    assert.deepEqual(lerMemoria("42", catalogo), {});
  });

  test("lerMemoria: mais de 2 KB vira memória vazia", () => {
    const grande = JSON.stringify({ lluvia: 1, zigzag: 2, lixo: "x".repeat(3000) });
    assert.ok(grande.length > 3000);
    assert.deepEqual(lerMemoria(grande, catalogo), {});
  });

  test("lerMemoria: descarta id desconhecido e valor que não é número finito (null, texto, infinito)", () => {
    assert.deepEqual(lerMemoria(JSON.stringify({ lluvia: 10, inventada: 5 }), catalogo), { lluvia: 10 });
    // O JSON não codifica NaN (o `JSON.stringify` o troca por null): o que chega é null.
    assert.deepEqual(lerMemoria('{"lluvia":null,"zigzag":5}', catalogo), { zigzag: 5 });
    assert.deepEqual(lerMemoria(JSON.stringify({ lluvia: "1", zigzag: 5 }), catalogo), { zigzag: 5 });
    assert.deepEqual(lerMemoria('{"lluvia":1e999,"zigzag":5}', catalogo), { zigzag: 5 });
    assert.deepEqual(lerMemoria('{"__proto__":{"x":1},"zigzag":5}', catalogo), { zigzag: 5 });
  });

  test("escreverMemoria faz a ida e volta com lerMemoria", () => {
    const antes = lerMemoria(JSON.stringify({ lluvia: 1795000000, zigzag: 1795000100 }), catalogo);
    const valor = escreverMemoria(antes, "bonfire", 1795000200);
    assert.deepEqual(lerMemoria(valor, catalogo), {
      lluvia: 1795000000, zigzag: 1795000100, bonfire: 1795000200,
    });
    // Tocar de novo só atualiza o tick.
    assert.deepEqual(lerMemoria(escreverMemoria(lerMemoria(valor, catalogo), "lluvia", 1795000300), catalogo), {
      lluvia: 1795000300, zigzag: 1795000100, bonfire: 1795000200,
    });
    assert.deepEqual(lerMemoria(escreverMemoria({}, "zigzag", 7), catalogo), { zigzag: 7 });
  });

  test("a memória com o catálogo inteiro cabe no limite", () => {
    let memoria = {};
    for (const obra of catalogo) memoria = lerMemoria(escreverMemoria(memoria, obra.id, 1795000000), catalogo);
    const valor = escreverMemoria(memoria, catalogo[0].id, 1795000000);
    assert.equal(Object.keys(lerMemoria(valor, catalogo)).length, catalogo.length);
    assert.ok(encodeURIComponent(valor).length <= 2048, `${encodeURIComponent(valor).length} caracteres`);
  });
});

// ---------------------------------------------------------------------------
// Sem cookie, o público vê o site de hoje
// ---------------------------------------------------------------------------

type Fontes = Parameters<typeof paraEntradaClima>[0];

function fontesAleatorias(rng: () => number): Fontes {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
  // Às vezes o campo some (NaN), às vezes cai numa borda das regras de hoje.
  const campo = (bordas: readonly number[], min: number, max: number): number => {
    const u = rng();
    if (u < 0.08) return NaN;
    if (u < 0.3) return pick(bordas);
    return min + rng() * (max - min);
  };
  const contagem = () => (rng() < 0.6 ? 0 : Math.floor(rng() * 40));

  const weatherData = rng() < 0.15
    ? pick([undefined, null] as const)
    : tempo({
        temp: campo([35, 35.01, 34.99, 0, -5, 40], -10, 50),
        humidity: campo([0, 10, 100], 0, 100),
        clouds: campo([50, 50.01, 49.99, 0, 100], 0, 100),
        speed: campo([0, 6.25, 3], 0, 30),
        deg: campo([0, 360], 0, 360),
        rain: rng() < 0.1 ? {} : { "1h": rng() < 0.5 ? 0 : campo([0, 0.5, 10], 0, 25) },
      });

  const lightningData = rng() < 0.15 ? null : { city: "", state: "", count: contagem(), events: [] };

  const fireSpotsData = rng() < 0.15
    ? null
    : focos(Array.from({ length: contagem() }, () => rng() * 100));

  return {
    weatherData,
    lightningData,
    fireSpotsData,
    lat: rng() < 0.05 ? NaN : rng() * 180 - 90,
    lng: rng() < 0.05 ? NaN : rng() * 360 - 180,
  };
}

describe("escolherObraDoSite", () => {
  test("sem cookie, a escolha é idêntica à de hoje (2000 casos de fontes)", () => {
    const rng = mulberry32(20261127);
    const original = Math.random;
    let comChuvaNaN = 0;
    let indisponiveis = 0;
    const categorias = new Set<string>();
    try {
      for (let i = 0; i < 2000; i++) {
        const fontes = fontesAleatorias(rng);
        const r = rng();
        const hoje = climaDaPaginaEm894a0ac(fontes);
        // A única divergência deliberada (ver o teste seguinte): hoje uma chuva NaN chega crua à
        // pontuação; o caminho novo a trata como indisponível, isto é, 0.
        const chuvaNaN = Number.isNaN(hoje.rain);
        if (chuvaNaN) comChuvaNaN++;
        if (!fontes.weatherData || !fontes.lightningData || !fontes.fireSpotsData) indisponiveis++;

        Math.random = () => r;
        const velho = getCompositionDecisionTrace(chuvaNaN ? { ...hoje, rain: 0 } : hoje);
        Math.random = original;
        categorias.add(velho.categoria);

        let chamouMemoria = false;
        const novo = escolherObraDoSite({
          entrada: paraEntradaClima(fontes),
          idDoCookie: undefined,
          memoriaDoCookie: () => {
            chamouMemoria = true;
            return undefined;
          },
          sortear: () => r,
        });

        assert.equal(novo.obra, velho.escolha, `obra #${i}`);
        assert.equal(novo.criterio.id, "atual", `critério #${i}`);
        assert.equal(novo.origem, "padrao", `origem #${i}`);
        assert.equal(novo.deTeste, false, `deTeste #${i}`);
        assert.equal(chamouMemoria, false, `o critério atual não lê memória #${i}`);
      }
    } finally {
      Math.random = original;
    }
    // O gerador exercita o que importa: fontes fora do ar e as cinco categorias.
    assert.ok(indisponiveis > 300, `${indisponiveis} casos com fonte indisponível`);
    assert.deepEqual([...categorias].sort(), ["atmosphere", "entropy", "fulmen", "hydros", "pyro"]);
    assert.ok(comChuvaNaN > 0 && comChuvaNaN < 100, `${comChuvaNaN} casos com chuva NaN`);
  });

  test("chuva NaN: hoje contamina hydros e a entropy vence; o caminho novo a trata como 0", () => {
    // Raio e fogo ativos: hoje a pyro (140) deveria vencer, mas a chuva NaN deixa hydros NaN, e
    // a comparação `>` com NaN entrega a vitória à última categoria, a entropy.
    const fontes: Fontes = {
      weatherData: tempo({ temp: 40, rain: { "1h": NaN } }),
      lightningData: { city: "", state: "", count: 2, events: [] },
      fireSpotsData: focos([10]),
      lat: 0,
      lng: 0,
    };
    const original = Math.random;
    try {
      Math.random = () => 0;
      assert.equal(getCompositionDecisionTrace(climaDaPaginaEm894a0ac(fontes)).categoria, "entropy");
    } finally {
      Math.random = original;
    }
    const novo = escolherObraDoSite({
      entrada: paraEntradaClima(fontes), idDoCookie: undefined, memoriaDoCookie: () => undefined,
      sortear: () => 0,
    });
    assert.equal(novo.obra, "bonfire");
  });

  test("cookie inválido ou do padrão: comportamento público, sem teste", () => {
    const entrada = paraEntradaClima({
      weatherData: tempo(), lightningData: null, fireSpotsData: null, lat: 0, lng: 0,
    });
    for (const idDoCookie of ["../x", "a".repeat(40), "", "b", "atual"]) {
      const r = escolherObraDoSite({ entrada, idDoCookie, memoriaDoCookie: () => undefined, sortear: () => 0.5 });
      assert.equal(r.criterio.id, "atual", idDoCookie);
      assert.equal(r.deTeste, false, idDoCookie);
    }
    const doPadrao = escolherObraDoSite({ entrada, idDoCookie: "atual", memoriaDoCookie: () => undefined, sortear: () => 0.5 });
    assert.equal(doPadrao.origem, "navegador");
  });

  test("gaia_criterio=B: critério de teste, lê a memória do rodízio do B", () => {
    const entrada = paraEntradaClima({
      weatherData: tempo({ temp: 25, humidity: 70, clouds: 20, speed: 3, rain: { "1h": 0 } }),
      lightningData: { city: "", state: "", count: 0, events: [] },
      fireSpotsData: focos([]),
      lat: 0,
      lng: 0,
    });
    const pedidos: string[] = [];
    const memorias: Record<string, string> = {};
    const escolher = () =>
      escolherObraDoSite({
        entrada,
        idDoCookie: "B",
        memoriaDoCookie: (id) => {
          pedidos.push(id);
          return memorias[cookieDoRodizio(id)];
        },
        sortear: () => 0,
      });

    const primeira = escolher();
    assert.equal(primeira.criterio.id, "B");
    assert.equal(primeira.origem, "navegador");
    assert.equal(primeira.deTeste, true);
    assert.deepEqual(pedidos, ["B"]);
    assert.ok(primeira.obra);

    // A obra que acabou de tocar vai para o fim da fila.
    memorias[cookieDoRodizio("B")] = escreverMemoria({}, primeira.obra, 1795000000);
    const segunda = escolher();
    assert.notEqual(segunda.obra, primeira.obra);

    // Memória forjada não derruba nada: vira memória vazia e a escolha volta à primeira.
    memorias[cookieDoRodizio("B")] = "{lixo";
    assert.equal(escolher().obra, primeira.obra);
  });

  test("um critério de teste que lança: a escolha segue com o padrão, sem derrubar a página", () => {
    class Quebrado extends CriterioDeDecisao {
      readonly id = "B";
      readonly versao = 1;
      readonly nome = "Quebrado";
      readonly resumo = "Sempre lança.";
      readonly usaMemoria = true;
      readonly usaNormal = false;
      readonly entradasUsadas: readonly NomeEntrada[] = [];
      protected calcular(): Calculo {
        throw new Error("quebrou");
      }
    }
    const comQuebrado = new GerenciadorDeCriterios([new CriterioAtual(), new Quebrado()], "atual");
    const entrada = paraEntradaClima({
      weatherData: tempo({ temp: 25, humidity: 70, clouds: 80, speed: 3, rain: { "1h": 2 } }),
      lightningData: null, fireSpotsData: null, lat: 0, lng: 0,
    });
    const args = { entrada, memoriaDoCookie: () => undefined, sortear: () => 0.5 };
    const semCookie = escolherObraDoSite({ ...args, idDoCookie: undefined });

    const avisos: unknown[][] = [];
    const original = console.warn;
    console.warn = (...a: unknown[]) => void avisos.push(a);
    let r: ReturnType<typeof escolherObraDoSite>;
    try {
      r = escolherObraDoSite({ ...args, idDoCookie: "B" }, comQuebrado);
    } finally {
      console.warn = original;
    }
    assert.equal(r.criterio.id, "atual");
    assert.equal(r.origem, "padrao");
    assert.equal(r.deTeste, false);
    assert.equal(r.obra, semCookie.obra);
    assert.equal(avisos.length, 1);
    assert.match(String(avisos[0][0]), /"B" falhou/);

    // O mesmo gerenciador, sem cookie ou com o do padrão, não passa pelo aviso.
    console.warn = (...a: unknown[]) => void avisos.push(a);
    try {
      assert.equal(escolherObraDoSite({ ...args, idDoCookie: undefined }, comQuebrado).obra, semCookie.obra);
      assert.equal(escolherObraDoSite({ ...args, idDoCookie: "atual" }, comQuebrado).origem, "navegador");
    } finally {
      console.warn = original;
    }
    assert.equal(avisos.length, 1);
  });
});
