/**
 * Mantém o canvas de uma animação do tamanho da viewport, sempre.
 *
 * O problema que isto resolve foi relatado por um visitante num MacBook Air e
 * reproduzido também no Windows 11: a obra abre, desenha, soa — e sobra uma
 * faixa à direita e embaixo mostrando o globo por trás. Toda animação lia
 * `p5.windowWidth`/`p5.windowHeight` uma única vez, no momento em que o sketch
 * nascia, e `createCanvas` fixava aquele tamanho para sempre. Qualquer mudança
 * de layout depois disso — a animação de tela cheia do macOS, a barra de menus
 * se escondendo, uma barra de favoritos aparecendo, zoom, devtools — deixava a
 * sobra permanente. Medido: janela 1470x849 com canvas preso em 1200x700, ou
 * 270 x 149 px de fundo à vista.
 *
 * Duas decisões valem explicação.
 *
 * **Por que não `windowWidth`/`windowHeight`.** São `innerWidth`/`innerHeight`,
 * que *incluem* a barra de rolagem. Um canvas desse tamanho cria a barra que o
 * mede: a 125 % de escala no Windows isso dá `inner` 1527 contra 1512 de área
 * útil, e 15 px do canvas ficam embaixo da barra. `clientWidth`/`clientHeight`
 * do `documentElement` são a viewport de layout, sem a barra.
 *
 * **Por que um `ResizeObserver` e não só o `windowResized`.** O evento de
 * resize da janela não cobre tudo o que muda o layout, e o visitante viu a
 * sobra com a janela *já maximizada antes* de tocar — ou seja, algo mexeu no
 * layout sem um resize de janela no meio. O observer pega essas causas,
 * inclusive as que eu não consegui reproduzir, e a primeira medição acontece
 * logo depois do mount, corrigindo de saída qualquer diferença entre o que o
 * sketch leu e a tela que ele recebeu. Sobre *qual* caixa é medida, veja o
 * comentário dentro de `acompanharJanela`: não é a do elemento pai.
 *
 * `resizeCanvas` limpa o desenho: obras que acumulam imagem (rectangles,
 * digitalOrganism, paintBrush) recomeçam ao redimensionar. É o preço, e é
 * barato — redimensionar é raro e a alternativa é a borda preta para sempre.
 */

/** O tamanho que o canvas deve ter antes de existir um canvas para medir. */
export function tamanhoDaTela(): { largura: number; altura: number } {
  if (typeof document === "undefined") return { largura: 0, altura: 0 };
  const raiz = document.documentElement;
  return { largura: raiz.clientWidth, altura: raiz.clientHeight };
}

/** Instância de p5 vista por este módulo: só o que ele realmente usa. */
type P5Minimo = {
  canvas?: { parentElement: HTMLElement | null } | null;
  windowResized?: () => void;
};

/**
 * Faz o canvas acompanhar a caixa onde está. Chamar no fim do `setup`, depois
 * do `createCanvas` — é o `createCanvas` que cria o elemento a observar.
 *
 * `aplicar` recebe o tamanho novo e é quem chama `p5.resizeCanvas` e refaz o
 * que a animação derive do tamanho (grades, partículas, zoom). Só é chamada
 * quando o tamanho muda de verdade, então pode ser caro lá dentro.
 */
export function acompanharJanela(
  p5: P5Minimo,
  aplicar: (largura: number, altura: number) => void,
): void {
  const pai = () => p5.canvas?.parentElement ?? null;

  // O alvo é a viewport de layout, e não a caixa do elemento pai — por mais
  // que medir o pai pareça o certo. Os dois contêineres que o app usa para
  // animação não têm tamanho próprio: o div que o `@p5-wrapper` cria é um
  // bloco cuja altura é o conteúdo, e o do generativeStrings é
  // `absolute top-0 left-0`, sem largura nem altura. Nos dois casos a caixa é
  // do tamanho do canvas que está dentro dela, então medi-la para
  // redimensionar o canvas é perguntar ao canvas que tamanho ele quer ter — a
  // resposta é sempre o tamanho que ele já tem.
  //
  // Isso não é teoria: a primeira versão deste módulo media o pai, e o teste
  // de regressão reprovou `attractor` e `bonfire` com 149 px de folga embaixo
  // (a altura, que vinha do bloco) e `generativeStrings` com 270 px à direita
  // (a largura, que vinha do div absoluto) — as três que o olho veria
  // quebradas, e nenhuma delas visível na leitura do código.
  //
  // Uma animação que algum dia precise viver numa caixa menor que a tela vai
  // precisar de outra fonte aqui — e de um contêiner com tamanho de verdade.
  const alvo = () => tamanhoDaTela();

  let ultimo = "";
  const aplicarSeMudou = () => {
    const { largura, altura } = alvo();
    if (largura < 1 || altura < 1) return;
    const chave = `${largura}x${altura}`;
    if (chave === ultimo) return;
    ultimo = chave;
    aplicar(largura, altura);
  };

  p5.windowResized = aplicarSeMudou;

  if (typeof ResizeObserver !== "undefined") {
    // Dois alvos, por motivos diferentes: o `documentElement` avisa quando a
    // viewport muda (é o que pega a tela cheia entrando em etapas, o zoom e o
    // devtools abrindo), e o elemento pai avisa quando o layout em volta da
    // animação muda sem a janela mexer. O observer vive preso a este closure,
    // que morre com a instância do p5 quando o wrapper desmonta.
    const observer = new ResizeObserver(() => aplicarSeMudou());
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement);
    }
    const elemento = pai();
    if (elemento) observer.observe(elemento);
  }

  // A correção de saída: entre a leitura do tamanho pelo sketch e a inserção
  // do canvas na página o layout pode ter mudado.
  aplicarSeMudou();
}
