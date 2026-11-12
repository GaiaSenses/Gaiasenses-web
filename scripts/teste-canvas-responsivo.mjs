/**
 * O canvas de cada animação tem de preencher a janela — e continuar
 * preenchendo quando ela muda de tamanho.
 *
 * Este é o teste do bug que um visitante relatou num MacBook Air e que também
 * aparece no Windows 11: a obra abre, desenha, soa, e sobra uma faixa à direita
 * e embaixo mostrando o globo por trás. A causa era o canvas nascer com o
 * tamanho que a janela tinha naquele instante e nunca mais mudar.
 *
 * Para cada obra o teste faz o caminho do visitante numa janela pequena, mede,
 * cresce a janela e mede de novo. Reprova se sobrar mais de 1 px de folga em
 * qualquer lado, ou se o canvas ficar vazio depois de redimensionar — um
 * `resizeCanvas` limpa o desenho, então uma obra que semeia estado a partir do
 * tamanho e não refaz essa semeadura passa no teste de folga e falha no olho.
 *
 * Fora do `npm test` de propósito: precisa de um navegador de verdade e de um
 * servidor rodando, que o CI não tem. Como usar:
 *
 *     npm run dev                      # num terminal
 *     npm run test:canvas              # noutro
 *
 * Variáveis: BASE (default http://localhost:3000), CHROME (caminho do
 * executável), OBRAS (lista separada por vírgula, default todas).
 */
import { chromium } from "playwright-core";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME =
  process.env.CHROME ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome");
const PEQUENA = { width: 1200, height: 700 };
const GRANDE = { width: 1470, height: 849 };
const LAT = -23.5528381;
const LNG = -46.6621533;

function obrasDeclaradas() {
  const raiz = "compositions";
  const ids = [];
  for (const pasta of readdirSync(raiz, { withFileTypes: true })) {
    if (!pasta.isDirectory()) continue;
    try {
      const manifesto = JSON.parse(
        readFileSync(join(raiz, pasta.name, "composition.json"), "utf8"),
      );
      if (manifesto.id) ids.push(manifesto.id);
    } catch {
      // pasta sem manifesto não é animação
    }
  }
  return ids.sort();
}

const pedidas = process.env.OBRAS?.split(",").map((s) => s.trim());
const OBRAS = pedidas?.length ? pedidas : obrasDeclaradas();

/** Mede o maior canvas visível que não seja o do mapa. */
const medir = (page) =>
  page.evaluate(() => {
    const candidatos = Array.from(document.querySelectorAll("canvas")).filter(
      (c) =>
        !c.classList.contains("mapboxgl-canvas") &&
        getComputedStyle(c).display !== "none" &&
        c.width > 1,
    );
    const canvas = candidatos.sort(
      (a, b) => b.width * b.height - a.width * a.height,
    )[0];
    if (!canvas) return { semCanvas: true };

    const caixa = canvas.getBoundingClientRect();
    let desenhados = 0;
    let opacos = 0;
    // Amostra de 1 em 16 pixels: a geometria acima é exata, mas aqui a
    // pergunta é só "sobrou desenho?", e varrer 1,2 milhão de pixels duas
    // vezes por medição fazia a rodada das 24 obras passar de meia hora.
    const PASSO = 16 * 4;
    try {
      const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx2d) {
        const d = ctx2d.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < d.length; i += PASSO) {
          if (d[i + 3] > 0) opacos++;
          if (d[i] || d[i + 1] || d[i + 2]) desenhados++;
        }
      } else {
        const gl =
          canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (gl) {
          const px = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(
            0, 0, canvas.width, canvas.height,
            gl.RGBA, gl.UNSIGNED_BYTE, px,
          );
          for (let i = 0; i < px.length; i += PASSO) {
            if (px[i + 3] > 0) opacos++;
            if (px[i] || px[i + 1] || px[i + 2]) desenhados++;
          }
        }
      }
    } catch {
      // um canvas sem contexto legível não invalida a medida de tamanho
    }

    return {
      janela: [innerWidth, innerHeight],
      layout: [
        document.documentElement.clientWidth,
        document.documentElement.clientHeight,
      ],
      canvas: [Math.round(caixa.width), Math.round(caixa.height)],
      folga: [
        Math.round(document.documentElement.clientWidth - caixa.right),
        Math.round(document.documentElement.clientHeight - caixa.bottom),
      ],
      desenhados,
      opacos,
      amostras: Math.ceil((canvas.width * canvas.height) / 16),
    };
  });

async function abrirObra(page, obra) {
  await page.goto(
    `${BASE}/pt/map3?lat=${LAT}&lng=${LNG}&mode=player&composition=${obra}&play=true`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForTimeout(3000);
  const iniciar = page.getByRole("button", { name: /^Iniciar|^Start/ });
  if (await iniciar.count()) {
    await iniciar.first().click().catch(() => {});
  }
  await page.waitForTimeout(5000);
}

const navegador = await chromium.launch({
  executablePath: CHROME,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});

const linhas = [];
for (const obra of OBRAS) {
  const contexto = await navegador.newContext({ viewport: PEQUENA });
  const page = await contexto.newPage();
  const linha = { obra };
  try {
    await abrirObra(page, obra);
    linha.antes = await medir(page);
    await page.setViewportSize(GRANDE);
    await page.waitForTimeout(3500);
    linha.depois = await medir(page);
    // Encolher também: um canvas que só sabe crescer deixa a página com barra
    // de rolagem e a obra maior que a janela.
    await page.setViewportSize(PEQUENA);
    await page.waitForTimeout(3500);
    linha.encolhida = await medir(page);
  } catch (erro) {
    linha.erro = String(erro).split("\n")[0].slice(0, 120);
  }
  await contexto.close();
  linhas.push(linha);
}
await navegador.close();

let reprovadas = 0;
console.log(
  "\nobra                 cresceu: folga   encolheu: folga   canvas   px (amostra)",
);
console.log("-".repeat(90));
for (const { obra, antes, depois, encolhida, erro } of linhas) {
  if (erro) {
    console.log(`${obra.padEnd(20)} ERRO: ${erro}`);
    reprovadas++;
    continue;
  }
  if (antes?.semCanvas && depois?.semCanvas) {
    console.log(`${obra.padEnd(20)} (sem canvas p5 — nada a medir)`);
    continue;
  }
  const f = depois.folga;
  const g = encolhida?.folga ?? [999, 999];
  const folgaOk =
    Math.abs(f[0]) <= 1 &&
    Math.abs(f[1]) <= 1 &&
    Math.abs(g[0]) <= 1 &&
    Math.abs(g[1]) <= 1;
  // Uma obra que ficou totalmente transparente depois do resize perdeu o
  // desenho: a folga está certa e a tela está vazia.
  const desenhouOk = depois.opacos > 0 && (encolhida?.opacos ?? 0) > 0;
  if (!folgaOk || !desenhouOk) reprovadas++;
  const marca = folgaOk && desenhouOk ? "ok " : "FALHA";
  console.log(
    `${obra.padEnd(20)} ${String(f.join("x")).padEnd(15)} ${String(
      g.join("x"),
    ).padEnd(17)} ${String(depois.canvas.join("x")).padEnd(9)} ${String(
      depois.desenhados,
    ).padEnd(10)} ${marca}`,
  );
}
console.log("-".repeat(86));
console.log(
  reprovadas === 0
    ? `todas as ${linhas.length} obras preenchem a janela depois de redimensionar`
    : `${reprovadas} obra(s) reprovada(s)`,
);
process.exit(reprovadas === 0 ? 0 : 1);
