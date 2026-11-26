# Critérios de decisão plugáveis + Gerenciador + simulador oculto — design

> Aprovado pelo Nycholas em 2026-11-26. O plano de implementação está em
> `docs/superpowers/plans/2026-11-26-criterios-e-simulador.md`.

## Contexto

O GaiaSenses escolhe a obra audiovisual pelo clima do lugar. Hoje há um critério só, escrito à mão
em `app/[locale]/map3/use-composition-queue.ts`. O estudo de 2026-11-15
(`my-docs/gaiasenses-criterio-decisao.html` e o artifact `FU4xDjaVgGcwg1Waudhv99`) propôs mais
quatro, e a equipe está numa fase de **experimentar e comparar critérios**. Faltam três coisas:

1. **Uma interface comum (classe abstrata).** Cada critério a implementa do seu jeito, e um
   **Gerenciador** carrega todos, roda todos com o mesmo clima e entrega os resultados organizados.
2. O Gerenciador define **qual critério é o padrão** que escolhe as obras no site.
3. Uma **tela oculta para pesquisadores**. Nela se mexe à mão em todas as entradas de clima e se vê
   o critério agir como uma **placa de circuito**, com trilhas que energizam até a obra. A obra
   escolhida **toca de verdade** com os valores simulados, e os critérios reagem na hora a cada
   mudança.

### Decisões do Nycholas (nesta conversa)

| Pergunta | Decisão |
|---|---|
| Critérios agora | **Os 5 do estudo:** 0 (atual), A (recalibração), B (dominante + rodízio), C (aderência por obra) e D (relativo ao lugar) |
| Onde fica o padrão | **Uma constante versionada no código**, que só se troca por PR. Além dela, **um teste por navegador**: o simulador grava um cookie, e aquele navegador usa outro critério no `/map3` real |
| Memória do rodízio (B/D) em produção | **Por navegador, num cookie** |
| Gravar o critério no GaiaLogs | **Depois**, em outra entrega |
| Sorteio no simulador | **Fiel + escolha manual:** a obra se mantém enquanto continuar candidata, há o botão "Sortear de novo" e a candidata acesa pode ser escolhida com um clique |
| Onde o simulador roda | **Tudo no navegador** |
| Linguagem visual | **Placa de circuito** |
| Visibilidade | **Nenhum botão nem link** para a rota |
| Branch | Separada, a partir do `origin/main` atualizado |

### Fatos verificados (main = origin/main = `894a0ac`, árvore limpa)

- **Critério atual:**
  - Há 5 categorias. A entropy tem piso 25, e o empate vai para a que vem depois na ordem
    atmosphere→fulmen→pyro→hydros→entropy.
  - Com raio e fogo juntos, a pyro vence.
  - A obra é sorteada de maneira uniforme, com `options[Math.floor(Math.random()*n)]`.
  - Quem chama é `page.tsx:116`, **no servidor**, que antes converte as fontes indisponíveis
    (NaN/null) em 0 (`:102-110`).
  - `closeFires` não é calculado no `page.tsx`, mas os eventos com `dist` estão em `fireSpotsData`.
- **O estudo tem uma implementação de referência dos 5 critérios.** É um módulo CommonJS
  (`my-docs/gaiasenses-criterio-decisao.html:422-928`, `module.exports = api`) que inclui:
  - `criterioAtual`, `criterioA`, `criterioB`, `criterioC` e `criterioD`;
  - `saliencias`, `LIMIARES`, `TYPES` e `sortear`;
  - **8 cenários de teste do B**, 10 presets e o catálogo de 23 obras;
  - **normais** (40 cidades × 12 meses × 3 h/15 h × μ/σ de temperatura, umidade, nuvens e vento,
    cerca de 116 KB).

  O critério 0 do estudo foi conferido contra o TypeScript real (2000/2000).
- **B e D têm estado** (memória: obra → tick da última vez que tocou, mais a regra "sem repetição
  imediata"). O D precisa do normal do lugar e, sem ele, se comporta igual ao B. B, C e D distinguem
  "sem dado" (null) de zero.
- **Catálogo:**
  - `ENABLED_COMPOSITIONS` tem 23 obras (`map-constants.ts:47`). Ele importa `.tsx`, então não pode
    ser carregado nos testes.
  - Os manifestos estão em `compositions-declared.generated.ts`, que importa os sketches `.tsx`.
  - `exemploClima` está fora do catálogo.
- **Node 22.21:** `abstract class` funciona com o type stripping do `node --test`, conferido.
  **Parameter properties (`constructor(private x)`) e `enum` não funcionam.**
- **Obras e áudio no navegador:**
  - Os sketches são `"use client"` e têm o canvas do tamanho da viewport.
  - `resolveAudio` é pura, mas mora junto do `getData`.
  - O `Pd4WebProvider` é por página e não tem cleanup. **Nenhum patch alcançável ouve canais de
    clima:** os receivers de bubble1, rain2 e thunder4 são `{}`, e o mapa15 só ouve
    acc/co2/lat/lon/sensors.
  - 19 sketches preferem a URL à prop, **inclusive o `play`**.
  - O middleware injeta `lat`, `lng` e `mode=map`.
  - O `Discrete` do airports reescreve a URL ao clicar e não para o Tone no desmonte.
  - O `DataSender` grava no GaiaLogs.
  - COEP `require-corp` vale para todas as rotas.
- **Bug do map3, pré-existente e fora do escopo:** a parada pedida durante a carga do patch é
  perdida. O consumidor de `stopRequestedRef`, que o PR #218 tinha posto, sumiu no merge do PR #217
  (`e3de57a`). O simulador contorna o problema (D3.6).
- **CI:** tsc, lint, `compositions:validate`, `npm test`, `patches:check` (inclui o `--check` do
  codegen) e build.

---

# PARTE 1 — DESIGN

## Objetivos

1. **Uma interface comum** (`abstract class CriterioDeDecisao`), com os 5 critérios implementados e
   cada porte **conferido automaticamente** contra a referência: o código de produção para o 0 e o
   estudo para A, B, C e D.
2. **Um Gerenciador** que registra os critérios, roda todos com a mesma entrada, isola a falha de
   um deles, mede o tempo de cada um, define o padrão do site e resolve o critério de teste por
   navegador.
3. **O `/map3` passa a escolher pelo Gerenciador.** Com o padrão "atual", o comportamento fica
   idêntico ao de hoje, e isso é comprovado por teste. Com o cookie de teste, aquele navegador usa
   outro critério, e B/D ganham rodízio guardado em cookie.
4. **O simulador oculto** tem:
   - as 11 entradas e os interruptores "clima indisponível" e "satélite indisponível";
   - a escolha do normal do lugar, para o D;
   - a **comparação dos 5 critérios**;
   - a **placa de circuito** do critério em foco;
   - a obra escolhida, tocando de verdade;
   - o botão "Usar este critério neste navegador";
   - o cenário inteiro guardado na URL.

## Não-objetivos

- Gravar o critério no GaiaLogs. O `ResultadoDeDecisao` já carrega o id e a versão, para a
  entrega futura.
- Trocar o padrão global nesta entrega. **`CRITERIO_PADRAO_ID` fica `"atual"`**: trocar antes da
  coluna no GaiaLogs misturaria critérios no corpus sem deixar rastro.
- Editar pesos e limiares na UI. Os critérios aceitam parâmetros com padrões, então isso é uma
  evolução simples.
- Normais do lugar em produção. Lá o D recebe `normal: null` e funciona como o B, e o resultado
  diz isso. As normais por proximidade dependem da futura API histórica.
- Neve e dia/noite como entradas. Não estão no vocabulário, e o oráculo recebe null.
- Modo exposição: o roteiro com obra fixa por cidade não muda.
- Autenticação, tradução do simulador e o bug do map3 (que fica para um PR separado).

## Anti-objetivos (fracasso mesmo que "funcione")

- Qualquer critério divergir da sua referência, ou o simulador ter uma cópia própria da regra.
- O site público mudar de comportamento para quem não tem o cookie.
- Gravar dado de pesquisa a partir do simulador, ou de um navegador em teste de critério.
- A rota aparecer na UI, no sitemap ou em buscadores.

## Abordagens consideradas

| Decisão | Opções | Escolha |
|---|---|---|
| Contrato dos critérios | (a) `abstract class` com *template method* (b) `interface` + objetos | **(a)**, como o Nycholas pediu. A classe base concentra o que é comum: tempo, sorteio, completar o circuito e montar o resultado. Cada critério só implementa `calcular()` |
| Execução de todos | (a) serial síncrona numa passada (b) Web Workers em paralelo | **(a)**: cada critério é puro e leva menos de 1 ms. Com Workers haveria cópia de dados e latência maior. O Gerenciador mede e mostra o tempo de cada um |
| Visualização de 5 critérios diferentes | (a) uma placa desenhada à mão por critério (b) **cada critério descreve um `Circuito`** (nós e ligações em 5 estágios) e um motor desenha qualquer um | **(b)**: acrescentar um critério não pede código de desenho |
| Simulador | tudo no navegador / via servidor / iframe | **Tudo no navegador** (decisão do Nycholas) |

## Design

### D1. O framework de critérios (`lib/criterios/`, tudo em `.ts` puro)

**Tipos (`tipos.ts`):**
- **`EntradaClima`**: os nomes do vocabulário, cada um `number | null`, em que null significa
  "a fonte não respondeu". São eles: temperature, humidity, clouds, rain, windSpeed, windDeg,
  lightningCount, fireCount, closeFires, lat e lon.
- **`ContextoDeDecisao`**:
  `{ catalogo: readonly ObraDoCatalogo[]; memoria: MemoriaDeRodizio; normal: NormalDoLugar | null; sortear: () => number }`.
  - `MemoriaDeRodizio` = `Readonly<Record<obraId, tick>>`;
  - `NormalDoLugar` = μ e σ por variável, no formato `toNormal` do estudo.
- **`Circuito`** = `{ nos, ligacoes }`:
  - cada nó tem estágio (`entrada | transformacao | agregacao | decisao | obra`), `rotulo`,
    `designador?`, `valor?` (texto já formatado), `ativo`, `destaque?` e `grupo?` (a chave da cor);
  - cada ligação tem `de`, `para`, `ativa` e `intensidade` (0..1).

**`CriterioDeDecisao` (`criterio-de-decisao.ts`), uma classe abstrata com template method:**
- **Campos abstratos:** `id` (`"atual" | "A" | "B" | "C" | "D"`), `versao`, `nome`, `resumo` (a
  frase de uma linha do estudo), `usaMemoria`, `usaNormal` e `entradasUsadas`.
- **`protected abstract calcular(entrada, contexto): Calculo`**, em que `Calculo` tem:
  - `vencedor { id, rotulo }`;
  - `candidatas: { obra, probabilidade, nota? }[]`, **na ordem do catálogo**;
  - `sorteio: "uniforme" | "ponderado" | "deterministico"`;
  - `motivo` (texto) e `numeros` (placares ou saliências, para a comparação);
  - `circuito`, só com os estágios de transformação a decisão.
- **`avaliar(entrada, contexto): ResultadoDeDecisao`** faz o comum:
  1. mede `duracaoMs`;
  2. chama `calcular`;
  3. **escolhe a obra**, conforme o tipo de sorteio:
     - uniforme: `candidatas[Math.floor(r*n)]`, exatamente como na produção hoje;
     - ponderado: acumula as probabilidades na ordem do catálogo, como o `sortear` do estudo;
     - determinístico: `candidatas[0]`;
  4. **completa o circuito:** acrescenta os 11 nós de entrada (ativos se estiverem em
     `entradasUsadas` e não forem null), os 23 nós de obra (iguais em todos os critérios, para
     comparar a olho), as ligações decisão→candidata e o destaque da obra escolhida;
  5. devolve `{ ...calculo, criterio: { id, versao, nome }, escolha, duracaoMs }`.

**`GerenciadorDeCriterios` (`gerenciador.ts`):**
- O construtor recebe a lista de critérios e o id do padrão. **Lança erro** se houver id
  duplicado ou se o padrão for desconhecido.
- `padrao`, `listar()` e `obter(id)`.
- `resolver(idDoNavegador) → { criterio, origem: "padrao" | "navegador" }`. Um id inválido cai no
  padrão.
- `avaliarTodos(entrada, contextoDe) → ResultadoDaComparacao[]` roda em série, na ordem de
  registro. **A falha de um critério vira `{ ok: false, erro }` sem derrubar os outros.**
- Exporta `CRITERIO_PADRAO_ID = "atual"` e a instância `gerenciador`, com os 5 registrados.

**Os 5 critérios:**

| Arquivo | Critério | Referência para o teste |
|---|---|---|
| `criterio-atual.ts` | **0 · Atual.** Tabela declarativa `REGRAS` na ordem de soma da produção (U1 raios >0 +90 · U2 focos >0 +100 · U3 temp >35 +40 · U4 vento ×4 · U5 nuvens >50 +30 · U6 chuva ×5 · U7 umidade ×0,5 · U8 temp ×0,3), `PISO`, `ORDEM_CATEGORIAS` e `CANDIDATAS`. Converte null em 0 como o `page.tsx` | uma cópia congelada da função de produção (`894a0ac`) **e** o `criterioAtual` do estudo |
| `criterio-a.ts` | **A · Recalibração**: fulmen 120, umidade só acima de 80, sem temperatura na hydros, mesmas listas | `criterioA` do estudo |
| `saliencia.ts` | Base comum de B/C/D: `LIMIARES`, `TYPES`, `ATTR_FAMILY`, `lerp`, `lerpLog`, `saliencias`, `tiposDaObra`, `obrasPorTipo` e `descreveTipo` | as funções do estudo |
| `criterio-b.ts` / `criterio-d.ts` | **B · Dominante + rodízio** e **D · Relativo ao lugar**, sobre uma função comum `dominanteRodizio(modo)` | `criterioB`/`criterioD` do estudo, incluindo sequências com memória, e os 8 cenários do estudo |
| `criterio-c.ts` | **C · Aderência por obra**, com sorteio ponderado pela aderência ao cubo | `criterioC` do estudo |
| `catalogo.ts` | `catalogoHabilitado()`: os manifestos filtrados pelas 23 habilitadas | tem que bater com o catálogo do estudo |
| `normais-do-estudo.ts` | As normais extraídas do `GAIA_DATA.normals` do estudo, com um cabeçalho de origem (ERA5 2020–2024) | — |

**Duas extrações que o framework exige:**
- O codegen emite um **`compositions-manifests.generated.ts` puro**, só de dados, que o registro
  servidor passa a importar.
- `ENABLED_COMPOSITIONS` vai para `components/compositions/obras-habilitadas.ts`, um arquivo puro
  que o `map-constants.ts` importa.

**`use-composition-queue.ts`** fica como fachada fina e reexporta o que já exportava. O
`getCompositionForClima` delega ao critério "atual".

### D2. Produção (`/map3`)

**Entrada:**
- `lib/criterios/entrada-do-site.ts` (puro) faz
  `paraEntradaClima({ weatherData, lightningData, fireSpotsData, lat, lng }) → EntradaClima`.
- Ele troca NaN e undefined por null e calcula `closeFires` pelos eventos com `dist < 50`.

**Escolha** em `page.tsx`, quando não há `?composition=` (que continua mandando):
1. `const { criterio, origem } = gerenciador.resolver(cookies().get("gaia_criterio")?.value)`;
2. lê a memória em `gaia_rodizio_<id>`, se o critério usa memória;
3. faz `criterio.avaliar(entrada, { catalogo, memoria, normal: null, sortear: Math.random })`;
4. usa `escolha ?? DEFAULT_COMPOSITION`.

**Cookies:**
- `lib/criterios/cookies.ts` (puro) tem `lerIdDoCriterio`, `lerMemoria` e `escreverMemoria`.
- **Validação estrita:**
  - o id do critério precisa estar na lista de ids, com no máximo 16 caracteres;
  - a memória é JSON de no máximo 2 KB, só com ids do catálogo e números finitos;
  - **lixo vira padrão ou memória vazia.**
- Os cookies não são `httpOnly`, porque o simulador os grava por JS, e não guardam dado pessoal.
- Usam `SameSite=Lax`, `path=/` e validade de 1 ano.

**Avanço do rodízio:**
- Um cliente `AvancarRodizio` é montado só em `mode=player`, quando a obra veio de um critério com
  memória.
- Ao montar, ele grava `gaia_rodizio_<id>[obra] = agora` (em segundos).

**Integridade do corpus** (decisão minha, consequência de "GaiaLogs depois"):
- Com o cookie de teste ativo e diferente do padrão, **o `DataSender` não é montado**.
- Aparece um aviso pequeno, sem clique e sem link: "Critério de teste neste navegador: B · Dominante
  + rodízio". Ele usa chaves novas em `messages/pt.json` e `messages/en.json`.
- Sem cookie, nada muda.

### D3. O simulador (`app/[locale]/simulator/`)

**D3.1 Página.** Um server component fino:
- `generateMetadata` com `robots: { index: false, follow: false }` e `alternates` sobrescrito;
- entrega o catálogo e os manifestos ao cliente;
- envolve o cliente em `<Pd4WebProvider><Suspense>`;
- o `robots.ts` não muda.

**D3.2 Estado e URL:**
- **O cenário** tem:
  - as 11 entradas (rótulo, unidade e faixa vêm do vocabulário);
  - `climaIndisponivel` e `sateliteIndisponivel`, que zeram os grupos de entrada para null, como o
    `climaEfetivo` do estudo;
  - o normal de referência: cidade, mês e período (dia = 15 h, noite = 3 h);
  - o critério em foco.
- **Na URL:**
  - o cenário inteiro vai por `history.replaceState`, com debounce de cerca de 150 ms. As entradas
    usam os nomes do vocabulário, mais `lng = lon`, `obra` e `origem`;
  - **`play` é sempre removido**;
  - ao carregar, a URL manda. "Veio da URL" significa ter algum atributo além do `lat`/`lng` do
    middleware.
- **Cenários prontos:** os **10 presets do estudo**, cada um com a sua cidade e o seu mês de
  referência.
- **O padrão** é o preset "Dia limpo".

**D3.3 Avaliação ao vivo.** A cada mudança, `gerenciador.avaliarTodos` roda de novo, sem debounce.
- Cada critério tem a sua memória de rodízio no estado local, mais os botões "Zerar memória" e
  "Tocar avança o rodízio".
- `selecao.ts` (puro) decide, por critério:
  - sorteio uniforme ou ponderado: **a obra se mantém enquanto continuar candidata** e, se deixar de
    ser, entra a `escolha` nova;
  - determinístico: segue a `escolha`;
  - manual: vale enquanto a obra continuar candidata;
  - "Sortear de novo" sorteia de novo.

**D3.4 Comparação.**
- Uma tabela-placa com 5 linhas: critério e versão, os selos **padrão do site** e **neste
  navegador**, vencedor, obra (com a probabilidade ou "rodízio"), tempo em ms e o resumo `motivo`.
- Clicar numa linha a põe **em foco**.
- Ações da linha em foco: "Usar este critério neste navegador", que grava o cookie, e "Voltar ao
  padrão neste navegador", que o apaga.

**D3.5 Placa do critério em foco.**
- `layout-placa.ts` (puro) faz `montarPlaca(circuito) → GeometriaPlaca`:
  - 5 colunas fixas, com a ordem dos nós dada pelo critério;
  - trilhas ortogonais com **curvas de 45°** e faixas no vão entre as colunas;
  - as 4 entradas só da obra correm num **barramento direto** até o J1.
- `estadoDasTrilhas` deriva aceso e intensidade do próprio `Circuito`.

**D3.6 O módulo da obra e o áudio.**
- **Montagem e escala:**
  - a obra só monta depois de **"Tocar obra"** (o gesto do usuário), e "Parar" a desmonta;
  - a obra **remonta cerca de 500 ms depois que um atributo declarado por ela assenta**, e o mp3 e
    o patch seguem tocando;
  - a troca de obra tem debounce de cerca de 400 ms;
  - o canvas fica num "monitor" do tamanho da viewport, reduzido por CSS `scale`, com botão "Tela
    cheia".
- **Fonte do áudio:** mp3 via `resolveAudio` → `<Player>`; patch via `getPatchIdForComposition`;
  `keepMapPatch` toca o `mapa15`; síntese, o próprio sketch toca.
- **Troca de patch sem cair no bug da parada pendente:**
  - `decidirAcaoDePatch` (puro) devolve `esperar`, `parar`, `iniciar` ou `nada`;
  - um efeito reconcilia a cada mudança;
  - **nunca chama `stopPatch` durante a carga**;
  - no desmonte, chama `stopPatch()`.
- **Canais `gaia.*`:** saem do cenário e só vão para os receivers que o patch declara. Quando não
  há nenhum, o módulo avisa "o patch não lê o clima".
- **airports:** um escudo `onClickCapture` impede o clique de chegar ao `TogglePlayButton`
  interno, e ao sair o Tone para.
- **Nunca** monta `DataSender` nem `CompositionControls`.

### D4. Visual: placa de circuito (frontend-design)

**Tokens:**
- **Máscara de solda:** `#0F3D2E`, realce `#13493A` e trilha coberta (apagada) `#2A6B52`.
- **Cobre energizado:** `#E8A15A`, brilho `#FFD08A`, ENIG `#D8B25C`.
- **Serigrafia:** `#EEF1E8` e `#A9BFB3`.
- **LEDs** em 6 cores, que só carregam o grupo do fenômeno:

  | Cor | Grupos |
  |---|---|
  | `#7CD6EA` | atmosphere, vento, nuvens |
  | `#B9A2FF` | fulmen, raios |
  | `#FF6B3D` | pyro, fogo, calor |
  | `#4AA3FF` | hydros, chuva, úmido |
  | `#F2C14E` | seco, frio |
  | `#F1E6C8` | entropy, calmaria |

- *Revisão contra o clichê:* troquei "preto + neon" por máscara verde real, cobre e serigrafia.

**Tipografia:**
- Montserrat na interface;
- **Barlow Semi Condensed** (`next/font/google`) na serigrafia: U1…, SW1, J1;
- displays de 7 segmentos **desenhados em SVG**, sem arquivo de fonte;
- números tabulares.

**Formas:**
- trilhas com 45°, pads e vias;
- CIs com fileiras de pinos;
- trimpots: slider serrilhado com campo numérico;
- **SW1** "Sortear de novo";
- interruptores de alavanca para "clima indisponível" e "satélite indisponível".

**Movimento:**
- **A ousadia fica num lugar só:** a "corrente" que corre nas trilhas energizadas
  (`stroke-dasharray`, cerca de 1,2 s) e **um pulso único** pelo caminho novo quando a escolha muda.
- Com `prefers-reduced-motion`, só mudam a cor e a espessura.

```
┌ Simulador de critérios   cenário [Dia limpo ▾]  [Copiar link do cenário] ─────────────────────────────────┐
│ ENTRADAS                │ COMPARAÇÃO  (critério · vencedor · obra · ms)            │ MÓDULO DA OBRA     │
│ ╔temperatura 25 °C╗     │ ◉ 0 Atual   padrão do site   hydros   lluvia 9%  0,02   │ ┌────────────────┐ │
│ ╔umidade 70 %═════╗     │ ○ A Recalibração             entropy  chaosTree 50%     │ │ canvas da obra │ │
│ ╔chuva 0 mm/h═════╗     │ ○ B Dominante+rodízio  ⚑ neste navegador  calmaria airports│ │ (escala)      │ │
│ ╔vento 1 m/s══════╗     │ ○ C Aderência                calmaria chaosTree 34%     │ └────────────────┘ │
│ ╔nuvens 20 %══════╗     │ ○ D Relativo ao lugar        calmaria airports           │ lluvia · Pd bubble1│
│ ╔raios 0══════════╗     │ [Usar este critério neste navegador]                    │ o patch não lê o   │
│ ╔focos 0 · <50 km 0╗    ├──────────── PLACA DO CRITÉRIO EM FOCO ───────────────────┤ clima · sorteio    │
│ ⏻ clima  ⏻ satélite      │ entradas ─▷[U6 ×5]══●══[hydros ▐58.4▌◉]═╗               │ [▶ Tocar obra] [■] │
│ normal: São Paulo·nov·dia │ ···▷[U1 >0]···○+90··[fulmen ▐0▌○]·····╠[MAX]══◉ lluvia═J1 [⛶ Tela cheia]     │
│ só p/ obra: dir · lat · lon ═══════════ barramento direto ═══════════════════════════════════════════J1  │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Responsivo:**
- ≥ 1280 px: 3 colunas, com o módulo fixo ao rolar;
- 768–1279 px: o módulo vai para o topo, com cerca de 40 vh, fixo;
- < 768 px: a placa rola na horizontal.

**Acessibilidade e texto:**
- **Acessibilidade:**
  - foco visível em dourado;
  - os LEDs e as linhas da comparação são `<button>`;
  - um resumo `aria-live`;
  - contraste ≥ 4,5:1.
- **Texto:** pt-BR, caixa de frase, verbos diretos.

### Fica a critério de quem implementa

Os passos dos sliders, as coordenadas e as faixas das trilhas, os tempos exatos dentro das faixas
dadas, a forma visual dos CIs e trimpots, os nomes internos dos componentes React e o texto dos nós
de cada circuito (desde que siga a tabela de regras ou as funções do estudo).

---

