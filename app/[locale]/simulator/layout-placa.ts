/**
 * Geometria da placa de circuito do critério em foco (D3.5). Lógica pura, sem React: o desenho
 * em SVG fica com a placa. Serve para qualquer `Circuito`:
 * - 5 colunas fixas, da esquerda para a direita pelo `estagio`. A ordem dos nós na coluna é a do
 *   circuito, e cada coluna fica centrada na altura da mais alta;
 * - os nós ocupam linhas de `ALTURA_LINHA`. Entradas e obras ocupam uma linha cada (os controles
 *   HTML se alinham a elas); os CIs do meio ganham uma linha por pino, para cada trilha ter o seu;
 * - as trilhas são ortogonais, com cantos cortados em 45°. Entre colunas vizinhas, cada trilha tem
 *   a sua faixa vertical no vão. As que pulam colunas, e o barramento direto das entradas só da
 *   obra até o J1, descem a um canal próprio na margem de baixo.
 */
import type { Circuito, Estagio, NoDoCircuito, NomeEntrada } from "@/lib/criterios/tipos";

export type Trilha = { id: string; de: string; para: string; pontos: [number, number][]; ativa: boolean; intensidade: number; direta?: boolean };
export type GeometriaPlaca = { largura: number; altura: number; alturaLinha: number;
  nos: (NoDoCircuito & { x: number; y: number; largura: number; altura: number })[]; trilhas: Trilha[]; j1: { x: number; y: number } };

type Ponto = [number, number];
type Conexao = Omit<Trilha, "pontos"> & { colDe: number; colPara: number };
/** Pedido de uma faixa vertical num vão: a trilha chega nela em `s` e sai em `t`. */
type Pedido = { vao: number; s: number; t: number; x: number };

const ESTAGIOS: readonly Estagio[] = ["entrada", "transformacao", "agregacao", "decisao", "obra"];
/** O J1 é uma coluna fictícia, logo à direita das obras. */
const COLUNA_J1 = ESTAGIOS.length;
/** Largura das caixas por coluna: a da entrada cabe um trimpot; a da obra, LED e rótulo. */
const LARGURA_DA_COLUNA = [176, 120, 120, 120, 152];
const ALTURA_LINHA = 28;
/** Folga entre a caixa do nó e a borda da linha. */
const FOLGA = 3;
const MARGEM = 16;
/** Distância mínima entre faixas vizinhas e entre canais da margem de baixo. */
const PASSO = 8;
/** Menor que o passo: o canto de 45° não encosta na faixa vizinha. */
const CHANFRO = 6;
/** O vão v fica à direita da coluna v: o -1 é a margem esquerda, e o 4 vai das obras ao J1. */
const VAO_MINIMO = (v: number) => (v < 0 ? MARGEM : v === COLUNA_J1 - 1 ? 56 : 120);

export function montarPlaca(circuito: Circuito, entradasSoDaObra: readonly NomeEntrada[]): GeometriaPlaca {
  const coluna = new Map<string, number>(circuito.nos.map((n) => [n.id, ESTAGIOS.indexOf(n.estagio)]));
  coluna.set("j1", COLUNA_J1);

  // 1. As conexões: as ligações do critério, a obra em destaque e o barramento direto até o J1.
  const conexoes: Conexao[] = [];
  const conectar = (de: string, para: string, ativa: boolean, intensidade: number, direta?: true) => {
    const colDe = coluna.get(de);
    const colPara = coluna.get(para);
    if (colDe === undefined || colPara === undefined) return;
    conexoes.push({ id: `${de}->${para}`, de, para, ativa, intensidade, ...(direta ? { direta } : {}), colDe, colPara });
  };
  for (const l of circuito.ligacoes) conectar(l.de, l.para, l.ativa, l.intensidade);
  const destaque = circuito.nos.find((n) => n.destaque);
  if (destaque) conectar(destaque.id, "j1", true, 1);
  const diretas = new Set(entradasSoDaObra.map((nome) => `entrada:${nome}`));
  for (const n of circuito.nos) if (n.estagio === "entrada" && diretas.has(n.id)) conectar(n.id, "j1", true, 0.5, true);

  // 2. As linhas: cada coluna empilha os seus nós e fica centrada na mais alta.
  const saem = agrupar(conexoes, (c) => c.de);
  const chegam = agrupar(conexoes, (c) => c.para);
  const linhasDoNo = new Map(circuito.nos.map((n) => [n.id,
    n.estagio === "entrada" || n.estagio === "obra"
      ? 1
      : Math.max(1, saem.get(n.id)?.length ?? 0, chegam.get(n.id)?.length ?? 0)]));
  const colunas = ESTAGIOS.map((e) => circuito.nos.filter((n) => n.estagio === e));
  const linhasDaColuna = colunas.map((nos) => nos.reduce((soma, n) => soma + linhasDoNo.get(n.id)!, 0));
  const maxLinhas = Math.max(1, ...linhasDaColuna);
  const primeiraLinha = new Map<string, number>();
  colunas.forEach((nos, c) => {
    let linha = Math.floor((maxLinhas - linhasDaColuna[c]) / 2);
    for (const n of nos) {
      primeiraLinha.set(n.id, linha);
      linha += linhasDoNo.get(n.id)!;
    }
  });
  const centroDaLinha = (linha: number) => MARGEM + linha * ALTURA_LINHA + ALTURA_LINHA / 2;
  const yJ1 = centroDaLinha(Math.floor((maxLinhas - 1) / 2));
  const yDoNo = (id: string) => (id === "j1" ? yJ1 : centroDaLinha(primeiraLinha.get(id)!));

  // 3. Os pinos: num CI, as trilhas se espalham pelas linhas na ordem da outra ponta.
  const ySai = new Map<Conexao, number>();
  const yChega = new Map<Conexao, number>();
  const pinos = (id: string, lista: Conexao[], ordem: (c: Conexao) => number, destino: Map<Conexao, number>) => {
    const linhas = linhasDoNo.get(id) ?? 1;
    const inicio = Math.max(0, Math.floor((linhas - lista.length) / 2));
    [...lista].sort((a, b) => ordem(a) - ordem(b)).forEach((c, i) => {
      destino.set(c, id === "j1" ? yJ1 : centroDaLinha(primeiraLinha.get(id)! + Math.min(inicio + i, linhas - 1)));
    });
  };
  for (const [id, lista] of saem) pinos(id, lista, (c) => yDoNo(c.para), ySai);
  for (const [id, lista] of chegam) pinos(id, lista, (c) => ySai.get(c)!, yChega);

  // 4. As faixas: entre colunas vizinhas, uma por trilha que não é reta; as outras descem a um
  //    canal na margem de baixo, com uma faixa no vão de saída e outra no vão de chegada.
  const yFundo = MARGEM + maxLinhas * ALTURA_LINHA;
  const pedidos: Pedido[] = [];
  const pedir = (vao: number, s: number, t: number): Pedido => {
    const p = { vao, s, t, x: 0 };
    pedidos.push(p);
    return p;
  };
  let canais = 0;
  const rotas = conexoes.map((c) => {
    const s = ySai.get(c)!;
    const t = yChega.get(c)!;
    if (c.colPara === c.colDe + 1) return { c, s, t, faixas: s === t ? [] : [pedir(c.colDe, s, t)] };
    const yCanal = yFundo + ++canais * PASSO;
    return { c, s, t, faixas: [pedir(c.colDe, s, yCanal), pedir(c.colPara - 1, yCanal, t)] };
  });

  // 5. As colunas na horizontal: cada vão cabe as suas faixas, espalhadas por igual.
  const porVao = agrupar(pedidos, (p) => p.vao);
  const larguraDoVao = (v: number) => Math.max(VAO_MINIMO(v), ((porVao.get(v)?.length ?? 0) + 1) * PASSO);
  const xColuna: number[] = [];
  let x = larguraDoVao(-1);
  for (let c = 0; c <= COLUNA_J1; c++) {
    xColuna.push(x);
    if (c < COLUNA_J1) x += LARGURA_DA_COLUNA[c] + larguraDoVao(c);
  }
  const bordaDireita = (c: number) => xColuna[c] + LARGURA_DA_COLUNA[c];
  for (const [v, lista] of porVao) {
    const inicio = v < 0 ? 0 : bordaDireita(v);
    const largura = larguraDoVao(v);
    [...lista].sort(compararFaixas).forEach((p, i) => {
      p.x = inicio + Math.round(((i + 1) * largura) / (lista.length + 1));
    });
  }

  const trilhas: Trilha[] = rotas.map(({ c, s, t, faixas }) => {
    const { colDe, colPara, ...trilha } = c;
    const meio = faixas.flatMap((p): Ponto[] => [[p.x, p.s], [p.x, p.t]]);
    return { ...trilha, pontos: chanfrar([[bordaDireita(colDe), s], ...meio, [xColuna[colPara], t]]) };
  });

  return {
    largura: xColuna[COLUNA_J1] + MARGEM,
    altura: yFundo + canais * PASSO + MARGEM,
    alturaLinha: ALTURA_LINHA,
    nos: circuito.nos.map((n) => {
      const c = coluna.get(n.id)!;
      return {
        ...n,
        x: xColuna[c],
        y: MARGEM + primeiraLinha.get(n.id)! * ALTURA_LINHA + FOLGA,
        largura: LARGURA_DA_COLUNA[c],
        altura: linhasDoNo.get(n.id)! * ALTURA_LINHA - 2 * FOLGA,
      };
    }),
    trilhas,
    j1: { x: xColuna[COLUNA_J1], y: yJ1 },
  };
}

function agrupar<T, K>(lista: readonly T[], chave: (item: T) => K): Map<K, T[]> {
  const grupos = new Map<K, T[]>();
  for (const item of lista) {
    const grupo = grupos.get(chave(item));
    if (grupo) grupo.push(item);
    else grupos.set(chave(item), [item]);
  }
  return grupos;
}

/**
 * Ordem das faixas num vão, da esquerda para a direita: primeiro as que descem, de quem sai mais
 * baixo para quem sai mais alto; depois as que sobem, de quem sai mais alto para quem sai mais
 * baixo. Assim, trilhas de um mesmo sentido só se cruzam quando uma abraça a outra.
 */
function compararFaixas(a: Pedido, b: Pedido): number {
  const desceA = a.t > a.s;
  if (desceA !== b.t > b.s) return desceA ? -1 : 1;
  const sentido = desceA ? -1 : 1;
  return sentido * (a.s - b.s) || sentido * (a.t - b.t);
}

/** Junta os trechos retos e corta cada canto em 45°, sem passar da metade de cada trecho. */
function chanfrar(bruto: Ponto[]): Ponto[] {
  const p: Ponto[] = [];
  for (const q of bruto) {
    const [a, b] = [p.at(-2), p.at(-1)];
    if (a && b && ((a[0] === b[0] && b[0] === q[0]) || (a[1] === b[1] && b[1] === q[1]))) p.pop();
    if (!mesmo(p.at(-1), q)) p.push(q);
  }
  const saida: Ponto[] = [p[0]];
  const empurrar = (q: Ponto) => {
    if (!mesmo(saida.at(-1), q)) saida.push(q);
  };
  for (let i = 1; i < p.length - 1; i++) {
    const [a, b, c] = [p[i - 1], p[i], p[i + 1]];
    const r = Math.min(CHANFRO, Math.floor(comprimento(a, b) / 2), Math.floor(comprimento(b, c) / 2));
    empurrar([b[0] - r * Math.sign(b[0] - a[0]), b[1] - r * Math.sign(b[1] - a[1])]);
    empurrar([b[0] + r * Math.sign(c[0] - b[0]), b[1] + r * Math.sign(c[1] - b[1])]);
  }
  if (p.length > 1) empurrar(p[p.length - 1]);
  return saida;
}

const comprimento = (a: Ponto, b: Ponto) => Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
const mesmo = (a: Ponto | undefined, b: Ponto) => a !== undefined && a[0] === b[0] && a[1] === b[1];
