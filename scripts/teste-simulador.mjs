/**
 * E2E repetível do simulador de critérios (`/[locale]/simulator`): os passos 1, 2, 4, 5 e 9 da
 * Tarefa 13 do plano `docs/superpowers/plans/2026-11-26-criterios-e-simulador.md`.
 *
 * 1. Controle positivo: um oscilador com ganho 0,3 dá RMS ≈ 0,212 com o relógio andando. Relógio
 *    parado é falha do ambiente (no WSL2 já aconteceu uma vez), e o teste tenta de novo.
 * 2. A página carrega sem erro no console, sem pedir microfone, com `noindex, nofollow` no <head>
 *    e com as 5 linhas da comparação.
 * 4. Nos 10 presets, o vencedor e as candidatas de cada critério na tela batem com o
 *    `gerenciador.avaliarTodos` rodado aqui no Node. Com o clima e o satélite indisponíveis, B, C
 *    e D dão calmaria, e o 0 dá o mesmo que dá com tudo em zero.
 * 5. Belém com o lluvia à mão: o patch soa (RMS > 0) e o canvas desenha (pixels não pretos > 0).
 *    Queimada com o bonfire à mão: no máximo 1 contexto tocando e o mp3 FOGO-AA andando; com
 *    `closeFires` = 0, passa a FOGO-AB.
 * 9. "Parar" deixa em silêncio (nenhum contexto tocando, mp3 pausado), e sair para o /pt/map3 com
 *    som tocando não deixa nenhum contexto do simulador tocando.
 *
 * Como mede o som, sem caixa de som e sem microfone: um init script envolve
 * `AudioNode.prototype.connect`, e toda ligação a um `AudioDestinationNode` também vai a um
 * `AnalyserNode` (Pd, Tone e p5.sound passam todos por aí); o RMS sai do
 * `getFloatTimeDomainData`. O `HTMLMediaElement.prototype.play` também é envolvido, para achar o
 * mp3. `getUserMedia` é recusado e contado: tem de ficar em 0. Um contexto suspenso ou fechado
 * não toca nada, e o analisador dele guarda o último quadro, então só os taps de contextos
 * "running" contam para o RMS. Os pixels são contados um a um, sem amostragem.
 *
 * Nada vai para o GaiaLogs: toda requisição ao Supabase é interceptada e respondida aqui, e o
 * teste reprova se alguma tentar gravar.
 *
 * O erro "sound toggle id" que o runtime do pd4web registra a cada patch aberto é conhecido (o
 * provider compartilhado não passa `soundToggleId`, igual no /map3): fica fora da conta de erros e
 * é contado à parte.
 *
 * Fora do `npm test` e da CI de propósito: precisa de um navegador de verdade e de um servidor
 * rodando. Como usar:
 *
 *     npm run dev                          # num terminal
 *     node scripts/teste-simulador.mjs     # noutro
 *
 * Variáveis: BASE (default http://localhost:3000) e CHROME (caminho do executável; default
 * /usr/bin/google-chrome no Linux, que é o mesmo Chrome que o plugin Playwright usa no WSL2).
 */
import { chromium } from "playwright-core";
import { register } from "node:module";

register("./ts-resolve-hook.mjs", import.meta.url);

const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME =
  process.env.CHROME ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome");
const R14 = /sound toggle id/i;

// ---------------------------------------------------------------------------------------------
// O lado do Node: o mesmo gerenciador, o mesmo catálogo e os mesmos presets da página.

const { gerenciador } = await import("@/lib/criterios/gerenciador");
const { catalogoHabilitado } = await import("@/lib/criterios/catalogo");
const { normalDe } = await import("@/lib/criterios/normais-do-estudo");
const { PRESETS, entradaEfetiva } = await import("@/app/[locale]/simulator/cenario");

const catalogo = catalogoHabilitado();

/** Vencedor (rótulo e id) e candidatas de cada critério, como o simulador avalia. */
function avaliarNoNode(cenario) {
  const { cidade, mes, periodo } = cenario.normalRef;
  const normal = normalDe(cidade, mes, periodo);
  const saida = {};
  for (const r of gerenciador.avaliarTodos(entradaEfetiva(cenario), (c) => ({
    catalogo,
    memoria: {},
    normal: c.usaNormal ? normal : null,
    sortear: Math.random,
  }))) {
    saida[r.criterio.id] = r.ok
      ? {
          id: r.resultado.vencedor.id,
          rotulo: r.resultado.vencedor.rotulo,
          candidatas: r.resultado.candidatas.map((c) => c.obra).sort(),
        }
      : { erro: r.erro };
  }
  return saida;
}

// ---------------------------------------------------------------------------------------------
// O lado do navegador.

/** Roda antes de qualquer script da página. */
function instrumentar() {
  window.__taps = [];
  window.__midias = [];
  window.__gum = 0;
  window.__ctxs = [];
  const recusar = () => {
    window.__gum++;
    return Promise.reject(new DOMException("bloqueado pelo teste", "NotAllowedError"));
  };
  if (navigator.mediaDevices) {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: recusar, configurable: true });
  }
  const registrar = (ctx) => {
    if (ctx && !window.__ctxs.includes(ctx)) window.__ctxs.push(ctx);
  };
  for (const nome of ["AudioContext", "webkitAudioContext"]) {
    const Orig = window[nome];
    if (!Orig) continue;
    const P = new Proxy(Orig, {
      construct(alvo, args, novo) {
        const ctx = Reflect.construct(alvo, args, novo === P ? alvo : novo);
        registrar(ctx);
        return ctx;
      },
    });
    window[nome] = P;
  }
  const connect = AudioNode.prototype.connect;
  const disconnect = AudioNode.prototype.disconnect;
  const tapsDe = new WeakMap();
  AudioNode.prototype.connect = function (dest, saida) {
    const r = connect.apply(this, arguments);
    try {
      if (dest instanceof AudioDestinationNode) {
        registrar(this.context);
        const an = this.context.createAnalyser();
        an.fftSize = 2048;
        connect.call(this, an, saida ?? 0);
        tapsDe.set(this, [...(tapsDe.get(this) ?? []), an]);
        window.__taps.push({ an, ctx: this.context, fonte: this.constructor.name });
      }
    } catch {}
    return r;
  };
  AudioNode.prototype.disconnect = function (dest) {
    const r = disconnect.apply(this, arguments);
    try {
      if (dest instanceof AudioDestinationNode) {
        for (const an of tapsDe.get(this) ?? []) disconnect.call(this, an);
        tapsDe.delete(this);
      }
    } catch {}
    return r;
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!window.__midias.includes(this)) window.__midias.push(this);
    return play.apply(this, arguments);
  };
  const rms = (an) => {
    const b = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(b);
    let s = 0;
    for (let i = 0; i < b.length; i++) s += b[i] * b[i];
    return Math.sqrt(s / b.length);
  };
  window.__medir = () => ({
    taps: window.__taps.map((t) => ({ estado: t.ctx.state, relogio: t.ctx.currentTime, rms: rms(t.an), fonte: t.fonte })),
    ctxs: window.__ctxs.map((c) => c.state),
    running: window.__ctxs.filter((c) => c.state === "running").length,
    midias: window.__midias.map((m) => ({ src: m.src.slice(m.src.lastIndexOf("/") + 1), paused: m.paused, t: m.currentTime })),
    gum: window.__gum,
  });
  /** Pixels não pretos de cada canvas do monitor do módulo, contados um a um. */
  window.__pixels = () =>
    Array.from(document.querySelectorAll("[data-monitor] canvas")).map((c) => {
      const ctx2d = c.getContext("2d", { willReadFrequently: true });
      let n = 0;
      if (ctx2d) {
        const d = ctx2d.getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) n++;
      } else {
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        if (gl) {
          const px = new Uint8Array(c.width * c.height * 4);
          gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
          for (let i = 0; i < px.length; i += 4) if (px[i] || px[i + 1] || px[i + 2]) n++;
        }
      }
      return { naoPretos: n, total: c.width * c.height };
    });
}

const navegador = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const supabase = { pedidos: [], gravacoes: 0 };

/** Um contexto novo, já instrumentado, com o Supabase interceptado e os erros contados. */
async function novaPagina() {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  await contexto.route(/supabase\.co|\/rest\/v1\//, async (route) => {
    const r = route.request();
    supabase.pedidos.push(`${r.method()} ${new URL(r.url()).pathname}`);
    if (["POST", "PATCH", "PUT", "DELETE"].includes(r.method())) supabase.gravacoes++;
    await route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });
  await contexto.addInitScript(instrumentar);
  const page = await contexto.newPage();
  const erros = { outros: [], r14: 0 };
  const anotar = (texto) => (R14.test(texto) ? erros.r14++ : erros.outros.push(texto.slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && anotar(m.text()));
  page.on("pageerror", (e) => anotar(`pageerror: ${e.message}`));
  return { contexto, page, erros };
}

async function abrirSimulador(page, busca = "") {
  await page.goto(`${BASE}/pt/simulator${busca}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-criterio]", { timeout: 90000 });
  await page.waitForTimeout(1200);
}

async function preparar(page, preset, foco, obra) {
  await page.selectOption("select[data-preset]", preset);
  await page.click(`[data-criterio="${foco}"] > button`);
  await page.waitForTimeout(300);
  if (obra) {
    await page.click(`button[data-obra="${obra}"]`);
    await page.waitForTimeout(600);
  }
}

const tocar = (page) => page.getByRole("button", { name: "Tocar obra" }).click();
const parar = (page) => page.getByRole("button", { name: "Parar" }).click();
const medir = (page) => page.evaluate(() => window.__medir());

/** O maior RMS dos contextos tocando em `n` leituras a cada 200 ms, e o relógio no início e no fim. */
const rmsMaximo = (page, n = 40) =>
  page.evaluate(async (n) => {
    let max = 0;
    let rel0 = null;
    let rel1 = null;
    for (let k = 0; k < n; k++) {
      for (const t of window.__medir().taps) {
        if (t.estado !== "running") continue;
        max = Math.max(max, t.rms);
        rel0 ??= t.relogio;
        rel1 = t.relogio;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return { max, rel0, rel1 };
  }, n);

// ---------------------------------------------------------------------------------------------
// Os passos.

const resultados = [];
function conferir(passo, ok, texto) {
  resultados.push({ passo, ok });
  console.log(`${ok ? "ok   " : "FALHA"} [${passo}] ${texto}`);
}
const f3 = (n) => (n === null || n === undefined ? "—" : Number(n).toFixed(3));
const f4 = (n) => (n === null || n === undefined ? "—" : Number(n).toFixed(4));

async function passo1() {
  const { contexto, page } = await novaPagina();
  await abrirSimulador(page);
  let r = null;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    await page.mouse.click(5, 5); // o gesto que libera o AudioContext
    r = await page.evaluate(async () => {
      const ctx = new AudioContext();
      await Promise.race([ctx.resume(), new Promise((ok) => setTimeout(ok, 2000))]);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.3;
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      await new Promise((ok) => setTimeout(ok, 600));
      const i = window.__taps.length - 1;
      const a = window.__medir().taps[i];
      await new Promise((ok) => setTimeout(ok, 600));
      const b = window.__medir().taps[i];
      osc.stop();
      await ctx.close();
      return { rms: b.rms, rel0: a.relogio, rel1: b.relogio };
    });
    r.tentativa = tentativa;
    if (r.rel1 > r.rel0) break;
    console.log(`     (relógio parado em ${f3(r.rel1)} s na tentativa ${tentativa}: falha do ambiente, de novo)`);
  }
  conferir(
    1,
    r.rel1 > r.rel0 && r.rms >= 0.2 && r.rms <= 0.22,
    `controle positivo: RMS ${f4(r.rms)} (esperado 0,212), relógio ${f3(r.rel0)} → ${f3(r.rel1)} s, tentativa ${r.tentativa}`,
  );
  await contexto.close();
  return r.rel1 > r.rel0;
}

async function passo2() {
  const { contexto, page, erros } = await novaPagina();
  await abrirSimulador(page);
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => ({
    robots: Array.from(document.head.querySelectorAll('meta[name="robots"]')).map((m) => m.content),
    linhas: Array.from(document.querySelectorAll("[data-criterio]")).map((l) => l.dataset.criterio),
    padrao: document.querySelector('[data-padrao="true"]')?.dataset.criterio,
    gum: window.__gum,
    running: window.__medir().running,
  }));
  conferir(2, erros.outros.length === 0, `erros no console: ${erros.outros.length} (fora "sound toggle id": ${erros.r14})${erros.outros.length ? " — " + erros.outros.join(" | ") : ""}`);
  conferir(2, r.gum === 0, `getUserMedia: ${r.gum}`);
  conferir(2, r.robots.includes("noindex, nofollow"), `robots no <head>: ${JSON.stringify(r.robots)}`);
  conferir(2, r.linhas.length === 5 && r.padrao === "atual", `linhas da comparação: ${r.linhas.length} (${r.linhas.join(", ")}), padrão ${r.padrao}`);
  conferir(2, r.running === 0, `contextos tocando ao abrir: ${r.running}`);
  await contexto.close();
}

async function passo4() {
  const { contexto, page, erros } = await novaPagina();
  await abrirSimulador(page);
  const CRITERIOS = ["atual", "A", "B", "C", "D"];
  const lerVencedores = () =>
    page.evaluate(() =>
      Object.fromEntries(
        Array.from(document.querySelectorAll("[data-criterio]")).map((l) => {
          const celula = l.querySelectorAll("button > span")[2];
          return [l.dataset.criterio, celula?.getAttribute("title") ?? celula?.textContent ?? null];
        }),
      ),
    );
  const lerLeds = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll("button[data-obra]:not([disabled])"))
        .map((b) => b.dataset.obra)
        .sort(),
    );

  const linhas = [];
  let divergencias = 0;
  const comparar = async (nome, node) => {
    const vencedores = await lerVencedores();
    for (const c of CRITERIOS) {
      await page.click(`[data-criterio="${c}"] > button`);
      await page.waitForTimeout(100);
      const leds = await lerLeds();
      const n = node[c];
      const okV = vencedores[c] === n.rotulo;
      const okC = JSON.stringify(leds) === JSON.stringify(n.candidatas);
      if (!okV || !okC) divergencias++;
      linhas.push(
        `${nome.padEnd(9)} ${(c === "atual" ? "0" : c).padEnd(2)} ${n.id.padEnd(11)} ${okV ? "=" : "≠"} ${String(vencedores[c]).padEnd(38)} ${String(n.candidatas.length).padStart(2)}/${String(leds.length).padEnd(2)} ${okC ? "=" : "≠"}`,
      );
    }
  };

  for (const p of PRESETS) {
    await page.selectOption("select[data-preset]", p.id);
    await page.waitForTimeout(250);
    await comparar(p.id, avaliarNoNode(p.cenario));
  }

  // Clima e satélite indisponíveis, sobre o Dia limpo.
  const limpo = PRESETS[0].cenario;
  await page.selectOption("select[data-preset]", "limpo");
  await page.click('[data-interruptor="clima"]');
  await page.click('[data-interruptor="satelite"]');
  await page.waitForTimeout(250);
  const semFontes = avaliarNoNode({ ...limpo, climaIndisponivel: true, sateliteIndisponivel: true });
  await comparar("sem fonte", semFontes);
  const zeros = Object.fromEntries(Object.keys(limpo.valores).map((k) => [k, 0]));
  const comZeros = avaliarNoNode({ ...limpo, valores: { ...limpo.valores, ...zeros } });

  console.log("\n     cenário   critério / vencedor no Node / na tela               candidatas Node/tela");
  for (const l of linhas) console.log(`     ${l}`);
  console.log("");
  conferir(4, divergencias === 0, `${linhas.length} linhas (10 presets + sem fonte) × vencedor e candidatas: ${divergencias} divergência(s)`);
  const calmos = ["B", "C", "D"].filter((c) => semFontes[c].id === "calmaria");
  conferir(4, calmos.length === 3, `sem clima e sem satélite, dão calmaria: ${calmos.join(", ")}`);
  conferir(
    4,
    semFontes.atual.id === comZeros.atual.id &&
      JSON.stringify(semFontes.atual.candidatas) === JSON.stringify(comZeros.atual.candidatas),
    `0 sem fontes = 0 com zeros: ${semFontes.atual.id} [${semFontes.atual.candidatas.join(", ")}] vs ${comZeros.atual.id} [${comZeros.atual.candidatas.join(", ")}]`,
  );
  conferir(4, erros.outros.length === 0, `erros no console: ${erros.outros.length}`);
  await contexto.close();
}

async function passo5() {
  const { contexto, page, erros } = await novaPagina();
  await abrirSimulador(page);

  await preparar(page, "belem", "atual", "lluvia");
  await tocar(page);
  await page.waitForTimeout(4000);
  const som = await rmsMaximo(page, 50);
  const px = await page.evaluate(() => window.__pixels());
  const legenda = await page.locator("[data-audio]").textContent();
  conferir(5, som.max > 0, `Belém, lluvia à mão (${legenda}): RMS máx ${f4(som.max)} em 10 s, relógio ${f3(som.rel0)} → ${f3(som.rel1)} s`);
  conferir(5, px.length === 1 && px[0].naoPretos > 0, `Belém, lluvia: ${px.length} canvas, ${px[0]?.naoPretos} pixels não pretos de ${px[0]?.total}`);
  await parar(page);
  await page.waitForTimeout(2000);

  await preparar(page, "queimada", "atual", "bonfire");
  await tocar(page);
  await page.waitForTimeout(3000);
  const a = await medir(page);
  await page.waitForTimeout(1000);
  const b = await medir(page);
  const mp3a = a.midias.at(-1);
  const mp3b = b.midias.at(-1);
  conferir(5, b.running <= 1, `Queimada, bonfire à mão: ${b.running} contexto(s) tocando (o mp3 não passa pelo Web Audio)`);
  conferir(
    5,
    mp3b?.src === "FOGO-AA.mp3" && !mp3b.paused && mp3b.t > mp3a.t,
    `mp3 ${mp3b?.src}, paused=${mp3b?.paused}, currentTime ${f3(mp3a?.t)} → ${f3(mp3b?.t)} s`,
  );
  await page.fill('[data-entrada="closeFires"] input[type=text]', "0");
  await page.press('[data-entrada="closeFires"] input[type=text]', "Enter");
  await page.waitForTimeout(2500);
  const c = await medir(page);
  await page.waitForTimeout(1000);
  const d = await medir(page);
  const mp3c = c.midias.at(-1);
  const mp3d = d.midias.at(-1);
  conferir(
    5,
    mp3d?.src === "FOGO-AB.mp3" && !mp3d.paused && mp3d.t > mp3c.t,
    `closeFires = 0: mp3 ${mp3d?.src}, paused=${mp3d?.paused}, currentTime ${f3(mp3c?.t)} → ${f3(mp3d?.t)} s`,
  );
  await parar(page);
  await page.waitForTimeout(1500);
  conferir(5, erros.outros.length === 0, `erros no console: ${erros.outros.length} (fora "sound toggle id": ${erros.r14})${erros.outros.length ? " — " + erros.outros.join(" | ") : ""}`);
  conferir(5, (await medir(page)).gum === 0, "getUserMedia: 0");
  await contexto.close();
}

async function passo9() {
  const casos = [
    ["belem", "atual", "lluvia"],
    ["queimada", "atual", "bonfire"],
    ["limpo", "B", null], // airports, o primeiro do rodízio da calmaria
  ];

  // "Parar"
  {
    const { contexto, page, erros } = await novaPagina();
    await abrirSimulador(page);
    for (const [preset, foco, obra] of casos) {
      await preparar(page, preset, foco, obra);
      const nome = await page.getAttribute("[data-modulo-obra]", "data-obra");
      await tocar(page);
      await page.waitForTimeout(4000);
      const tocando = await rmsMaximo(page, 20);
      const mp3Tocando = (await medir(page)).midias.find((m) => !m.paused);
      await parar(page);
      await page.waitForTimeout(2500);
      const depois = await rmsMaximo(page, 5);
      const m = await medir(page);
      const pausados = m.midias.every((x) => x.paused);
      conferir(
        9,
        m.running === 0 && depois.max === 0 && pausados,
        `Parar no ${nome}: antes RMS ${f4(tocando.max)}${mp3Tocando ? ` + ${mp3Tocando.src}` : ""}; depois ${m.running} contexto(s) tocando, RMS ${f4(depois.max)}, mp3 ${m.midias.length ? m.midias.map((x) => `paused=${x.paused}`).join(",") : "nenhum"}`,
      );
    }
    conferir(9, erros.outros.length === 0, `erros no console: ${erros.outros.length} (fora "sound toggle id": ${erros.r14})${erros.outros.length ? " — " + erros.outros.join(" | ") : ""}`);
    await contexto.close();
  }

  // Sair para o /pt/map3 pela navegação do próprio Next, com o som tocando: o documento continua
  // o mesmo, então os contextos do simulador continuam medíveis depois da troca de página.
  for (const [preset, foco, obra] of casos) {
    const { contexto, page, erros } = await novaPagina();
    await abrirSimulador(page);
    await preparar(page, preset, foco, obra);
    const nome = await page.getAttribute("[data-modulo-obra]", "data-obra");
    await tocar(page);
    await page.waitForTimeout(4000);
    const antes = await medir(page);
    const doSimulador = antes.ctxs.length;
    await page.evaluate(() => window.next.router.push("/pt/map3"));
    await page.waitForURL(/\/pt\/map3/, { timeout: 90000 });
    await page.waitForTimeout(6000);
    const depois = await page.evaluate(
      (n) => ({
        running: window.__ctxs.slice(0, n).filter((c) => c.state === "running").length,
        estados: window.__ctxs.slice(0, n).map((c) => c.state),
        midias: window.__midias.map((m) => m.paused),
        simulador: !!document.querySelector("[data-modulo-obra]"),
      }),
      doSimulador,
    );
    conferir(
      9,
      depois.running === 0 && depois.midias.every(Boolean) && !depois.simulador,
      `/pt/map3 saindo do ${nome} (${antes.running} contexto(s) e ${antes.midias.filter((m) => !m.paused).length} mp3 tocando): contextos do simulador ${JSON.stringify(depois.estados)}, mp3 paused ${JSON.stringify(depois.midias)}`,
    );
    if (erros.outros.length) console.log(`     erros no console: ${erros.outros.join(" | ")}`);
    await contexto.close();
  }
}

// ---------------------------------------------------------------------------------------------

try {
  const ambienteOk = await passo1();
  if (ambienteOk) {
    await passo2();
    await passo4();
    await passo5();
    await passo9();
  } else {
    console.log("     o relógio de áudio não anda neste ambiente: os passos de som não têm como medir");
  }
  conferir("GaiaLogs", supabase.gravacoes === 0, `tentativas de gravar no Supabase: ${supabase.gravacoes} (pedidos: ${supabase.pedidos.length})`);
} catch (erro) {
  conferir("execução", false, String(erro).split("\n")[0].slice(0, 200));
} finally {
  await navegador.close();
}

const falhas = resultados.filter((r) => !r.ok).length;
console.log(falhas === 0 ? `\ntodas as ${resultados.length} conferências passaram` : `\n${falhas} de ${resultados.length} conferências falharam`);
process.exit(falhas === 0 ? 0 : 1);
