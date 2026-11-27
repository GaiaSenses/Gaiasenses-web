# Critérios de decisão plugáveis + Gerenciador + simulador oculto — plano de implementação


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Um framework de critérios de decisão: uma classe abstrata, 5 implementações conferidas contra a
  referência e um Gerenciador com padrão e teste por navegador.
- O `/map3` escolhendo por ele, sem mudar nada para o público.
- Um simulador oculto que compara os critérios, desenha o critério em foco como placa de circuito
  e toca a obra escolhida.

**Architecture:**
- `lib/criterios/` tem os critérios e o Gerenciador, em `.ts` puro, testado por `node --test`. Os
  portes são conferidos contra oráculos: a cópia congelada da produção e o módulo CommonJS do
  estudo.
- O `page.tsx` resolve o critério pelo cookie e avalia no servidor.
- O simulador é um cliente que avalia tudo a cada mudança. Ele desenha o `Circuito` do critério em
  foco por um motor genérico e monta o sketch por um registro gerado com `next/dynamic`.

**Tech Stack:** Next.js 14.2.35 (App Router), React 18, TypeScript, Tailwind, p5 / @p5-wrapper,
pd4web, Tone.js, `node --test` com type stripping (Node 22.21), Playwright (plugin MCP +
playwright-core).

**Spec:** `docs/superpowers/specs/2026-11-26-criterios-e-simulador-design.md` (a Parte 1 acima).

## Global Constraints

- Branch `feat/criterios-e-simulador`, criada de `origin/main` depois de `git fetch origin`. Os
  commits ficam locais, e **push e PR só com o pedido do Nycholas**.
- Commits em inglês, no padrão conventional (`feat(criterios): …`), e comentários em pt-BR, como no
  repositório.
- Nada de parameter properties nem `enum`: o type stripping do Node os recusa. Toda lógica testável
  fica em `.ts`, com testes em `tests/*.test.ts`. Os oráculos ficam em `tests/fixtures/`, fora do
  glob de teste.
- **`CRITERIO_PADRAO_ID = "atual"`** nesta entrega, e o público sem cookie continua com o
  comportamento de hoje.
- Os cookies são `gaia_criterio` e `gaia_rodizio_<id>`: validados no servidor, sem dado pessoal,
  com `SameSite=Lax`, `path=/` e 1 ano.
- O simulador não importa `DataSender`, `supabase` nem `CompositionControls`. Não há link nem botão
  para `/simulator`, e o `<head>` sai com `noindex, nofollow`. O texto é só pt-BR, em caixa de
  frase.
- Só assets same-origin (COEP), com as fontes por `next/font`. A paleta e a tipografia seguem a
  seção D4.
- Antes de cada commit de código: `npx tsc --noEmit && npm run lint && npm test`. Depois de cada
  tarefa com código: `graphify update .`.

## Review Focus

1. **Cookie forjado ou corrompido** (`gaia_criterio=../x`, memória com 50 KB, JSON inválido, id de
   obra desconhecido). Esperado: padrão e memória vazia, sem erro 500. Testes na Tarefa 8.
2. **Fontes indisponíveis.** Esperado: com todo campo null, nenhum critério lança erro; o 0 e o A
   tratam o null como 0, e B, C e D caem em calmaria. Testes nas Tarefas 3–6.
3. **Arrastar um slider rápido demais.** Esperado: obra e patch acompanham o último valor, sem patch
   órfão. Teste na Tarefa 13, passo 6.
4. **Sair da página com som tocando, ou abrir um link a frio.** Esperado: silêncio ao sair, e a obra
   só monta depois de "Tocar obra". Teste na Tarefa 13, passos 3 e 9.
5. **Um critério que lança erro.** Esperado: a comparação mostra o erro naquela linha, e os outros
   seguem funcionando. Teste na Tarefa 1.

---

### Task 0: Branch e documentos

- [ ] **Step 1:** Rodar `git fetch origin && git status -sb`. Esperado: `## main...origin/main`,
  sem mudanças locais.
- [ ] **Step 2:** Rodar `git switch -c feat/criterios-e-simulador origin/main`.
- [ ] **Step 3:** Gravar `docs/superpowers/specs/2026-11-26-criterios-e-simulador-design.md`
  (Parte 1) e `docs/superpowers/plans/2026-11-26-criterios-e-simulador.md` (Parte 2), e commitar
  com `git commit -m "docs: design and plan for pluggable decision criteria and the simulator"`.

### Task 1: Contrato, classe abstrata e Gerenciador

**Files:**
- Create: `lib/criterios/tipos.ts`, `lib/criterios/criterio-de-decisao.ts`,
  `lib/criterios/gerenciador.ts` (só a classe; a instância vem na Tarefa 7)
- Test: `tests/criterios-contrato.test.ts`, com critérios falsos definidos no próprio teste

**Interfaces — Produces:**
```ts
// tipos.ts
export type IdCriterio = "atual" | "A" | "B" | "C" | "D";
export type NomeEntrada = "temperature" | "humidity" | "clouds" | "rain" | "windSpeed" | "windDeg"
  | "lightningCount" | "fireCount" | "closeFires" | "lat" | "lon";
export type EntradaClima = Record<NomeEntrada, number | null>;
export type ObraDoCatalogo = { id: DeclaredCompositionName; label: string; attributes: readonly string[] };
export type MemoriaDeRodizio = Readonly<Record<string, number>>;
export type NormalDoLugar = Partial<Record<"temperature" | "humidity" | "clouds" | "windSpeed", { mu: number; sd: number }>>;
export type ContextoDeDecisao = { catalogo: readonly ObraDoCatalogo[]; memoria: MemoriaDeRodizio; normal: NormalDoLugar | null; sortear: () => number };
export type Estagio = "entrada" | "transformacao" | "agregacao" | "decisao" | "obra";
export type NoDoCircuito = { id: string; estagio: Estagio; rotulo: string; designador?: string; valor?: string; ativo: boolean; destaque?: boolean; grupo?: string };
export type LigacaoDoCircuito = { de: string; para: string; ativa: boolean; intensidade: number };
export type Circuito = { nos: NoDoCircuito[]; ligacoes: LigacaoDoCircuito[] };
export type Candidata = { obra: DeclaredCompositionName; probabilidade: number; nota?: string };
export type Calculo = { vencedor: { id: string; rotulo: string }; candidatas: Candidata[];
  sorteio: "uniforme" | "ponderado" | "deterministico"; motivo: string; numeros: Record<string, number | null>; circuito: Circuito };
export type ResultadoDeDecisao = Calculo & { criterio: { id: IdCriterio; versao: number; nome: string };
  escolha: DeclaredCompositionName | null; duracaoMs: number };
export type ResultadoDaComparacao = { criterio: CriterioDeDecisao; ok: true; resultado: ResultadoDeDecisao }
  | { criterio: CriterioDeDecisao; ok: false; erro: string };
// criterio-de-decisao.ts
export abstract class CriterioDeDecisao {
  abstract readonly id: IdCriterio; abstract readonly versao: number; abstract readonly nome: string;
  abstract readonly resumo: string; abstract readonly usaMemoria: boolean; abstract readonly usaNormal: boolean;
  abstract readonly entradasUsadas: readonly NomeEntrada[];
  protected abstract calcular(entrada: EntradaClima, contexto: ContextoDeDecisao): Calculo;
  avaliar(entrada: EntradaClima, contexto: ContextoDeDecisao): ResultadoDeDecisao;
}
// gerenciador.ts
export class GerenciadorDeCriterios {
  constructor(criterios: readonly CriterioDeDecisao[], padraoId: IdCriterio);
  get padrao(): CriterioDeDecisao;
  listar(): readonly CriterioDeDecisao[];
  obter(id: string): CriterioDeDecisao | null;
  resolver(idDoNavegador: string | null | undefined): { criterio: CriterioDeDecisao; origem: "padrao" | "navegador" };
  avaliarTodos(entrada: EntradaClima, contextoDe: (c: CriterioDeDecisao) => ContextoDeDecisao): ResultadoDaComparacao[];
}
```
`DeclaredCompositionName` entra só por `import type`.

- [ ] **Step 1: Escrever os testes que falham:**
  - `uniforme usa floor(r*n)`: 3 candidatas e `r = 0.67` dão a 3ª.
  - `ponderado acumula na ordem do catálogo`: com `[0.2, 0.5, 0.3]`, `r = 0.69` dá a 2ª e
    `r = 0.71` dá a 3ª.
  - `determinístico pega a primeira`.
  - `sem candidatas, escolha é null`.
  - `avaliar completa o circuito`: há 11 nós de entrada, e os ativos são exatamente os de
    `entradasUsadas` que não são null; há os nós de obra do catálogo e só a obra escolhida tem
    `destaque`; há uma ligação decisão→obra por candidata.
  - `duracaoMs é número ≥ 0`.
  - `gerenciador recusa id duplicado e padrão desconhecido`.
  - `resolver`: um id válido dá `origem: "navegador"`, e `"zz"`, `null` ou `undefined` dão o padrão.
  - `avaliarTodos isola a falha`: um critério falso que lança vira `{ ok: false, erro }`, e os
    outros vêm com `ok: true`, na ordem de registro.
- [ ] **Step 2:** Rodar `npm test`. Esperado: FAIL, módulos inexistentes.
- [ ] **Step 3:** Implementar os três arquivos.
- [ ] **Step 4:** Rodar `npm test && npx tsc --noEmit && npm run lint`. Esperado: verde.
- [ ] **Step 5:** Commitar com
  `git commit -m "feat(criterios): abstract decision criterion and its manager"`.

### Task 2: Catálogo puro (codegen + obras habilitadas)

**Files:**
- Modify: `scripts/gen-composition-registry.mjs`, que passa a emitir mais duas saídas em `saidas`:
  - `components/compositions/compositions-manifests.generated.ts`, só dados, com o
    `DECLARED_COMPOSITION_MANIFESTS` e o tipo `DeclaredCompositionName`;
  - `components/compositions/compositions-client.generated.ts`, com `"use client"` e o mapa
    `CLIENT_SKETCHES`, de chave `manifest.id` e import pela pasta, via
    `dynamic(() => import("…/sketch"), { ssr: false })`.

  O registro servidor passa a importar os manifestos do arquivo puro.
- Create: `components/compositions/obras-habilitadas.ts`, com
  `export const OBRAS_HABILITADAS: ReadonlySet<string>` (as 23, movidas de `map-constants.ts:47-71`).
- Modify: `app/[locale]/map3/map-constants.ts`, que passa a importar daí.
- Create: `lib/criterios/catalogo.ts` com
  `catalogoHabilitado(): readonly ObraDoCatalogo[]` (na ordem dos manifestos).
- Create: `tests/fixtures/estudo-dados.cjs`, com o catálogo do estudo (id, label e attributes) e a
  linha de origem.
- Test: `tests/criterios-catalogo.test.ts`

- [ ] **Step 1: Escrever os testes que falham:**
  - `catálogo tem as 23 habilitadas e não tem exemploClima`.
  - `catálogo bate com o do estudo`: os mesmos ids e os mesmos `attributes`. Se falhar, alguma obra
    mudou desde o estudo, e a referência dos testes B/C/D precisa ser revista.
- [ ] **Step 2:** Rodar `npm test`. Esperado: FAIL.
- [ ] **Step 3:** Implementar e rodar `npm run compositions:codegen`.
- [ ] **Step 4:** Rodar `node scripts/gen-composition-registry.mjs --check`. Esperado: 0. Depois,
  editar um gerado à mão e repetir: o esperado é falhar. Desfazer a edição.
- [ ] **Step 5:** Rodar `npm test && npx tsc --noEmit && npm run lint && npm run patches:check`.
  Esperado: verde.
- [ ] **Step 6:** Commitar com
  `git commit -m "feat(compositions): pure manifest catalog and a client-side sketch registry"`.

### Task 3: Critério 0 · Atual (equivalência com a produção)

**Files:**
- Create: `lib/criterios/criterio-atual.ts`, que exporta `class CriterioAtual extends
  CriterioDeDecisao` e as tabelas `REGRAS`, `PISO`, `ORDEM_CATEGORIAS` e `CANDIDATAS` da seção D1.
  `id = "atual"`, `versao = 1`, `sorteio = "uniforme"`.
- Create: `tests/fixtures/criterio-producao.ts`, cópia congelada de `getCompositionDecisionTrace`
  em `894a0ac`, com `CompositionsInfo.x.name` trocado pelas strings literais.
- Create: `tests/fixtures/estudo-criterios.cjs`, com as linhas 422–928 de
  `my-docs/gaiasenses-criterio-decisao.html` sem a tag `<script>`. É o módulo CommonJS do estudo,
  com um cabeçalho de origem. A extração usa um script descartável no scratchpad; conferir à mão a
  1ª e a última linha.
- Modify: `app/[locale]/map3/use-composition-queue.ts`, que vira fachada e mantém os exports
  (`ClimaData`, `getCompositionDecisionTrace`, `getCompositionForClima`, `useCompositionQueue`).
- Test: `tests/criterio-atual.test.ts`

**Interfaces — Produces:** `new CriterioAtual()`.
- `numeros` = os scores das 5 categorias;
- `circuito`: 8 CIs U1–U8 → 5 categorias → nó `decisao:max`;
- `vencedor.id` é a categoria.

- [ ] **Step 1: Escrever os testes que falham:**
  - `equivale à produção em 5000 climas`: PRNG mulberry32 com semente fixa, e 30% dos casos na
    borda (temperatura 35, 35,01 e negativa; nuvens 50 e 51; zeros; vento 6,25 para empate; campos
    null). Para cada clima, `Math.random = () => r` no oráculo e `sortear = () => r` no novo. Os
    `scores` têm que ser iguais por `Object.is`, e `categoria` e `escolha` têm que bater.
  - `equivale ao criterioAtual do estudo`: o mesmo vencedor e as mesmas probabilidades.
  - `empate vai para a categoria que vem depois`: vento 6,25, temperatura 10, umidade 10, o resto 0
    → entropy.
  - `raio e fogo juntos → pyro`.
  - `limiar é estrito em 35 °C e em 50 % de nuvens`.
  - `tudo null → igual a tudo 0`.
  - `circuito: U1 aceso só com raios > 0`.
- [ ] **Step 2:** Rodar `npm test`. Esperado: FAIL.
- [ ] **Step 3:** Implementar e transformar `use-composition-queue.ts` em fachada.
- [ ] **Step 4:** Rodar `npm test && npx tsc --noEmit && npm run lint`. Esperado: verde.
- [ ] **Step 5:** Commitar com
  `git commit -m "feat(criterios): current criterion as a class, proven equal to production"`.

### Task 4: Critério A · Recalibração

**Files:**
- Create: `lib/criterios/criterio-a.ts`. Reaproveita `CANDIDATAS` e `ORDEM_CATEGORIAS` da Tarefa 3,
  com regras próprias: raios +120; focos +100; temperatura acima de 35 +40; vento ×4; nuvens acima
  de 50 +30; chuva ×5; umidade acima de 80 → ×0,5. `sorteio = "uniforme"`.
- Test: `tests/criterio-a.test.ts`

- [ ] **Step 1: Escrever os testes que falham:**
  - `equivale ao criterioA do estudo em 5000 climas`: `vencedor` e `scores` iguais, e as mesmas
    probabilidades.
  - `umidade 80 não soma; 81 soma 40,5`.
  - `tudo null não lança`.
- [ ] **Step 2:** Rodar `npm test` (FAIL). **Step 3:** Implementar. **Step 4:** Rodar
  `npm test && npx tsc --noEmit` (verde).
- [ ] **Step 5:** Commitar com
  `git commit -m "feat(criterios): criterion A, the recalibration from review #101"`.

### Task 5: Saliência + Critérios B e D (com memória e normal)

**Files:**
- Create: `lib/criterios/saliencia.ts`, porte de `LIMIARES`, `TYPES`, `ATTR_FAMILY`, `CALMARIA`,
  `lerp`, `lerpLog`, `saliencias`, `familiasDaObra`, `tiposDaObra`, `obrasPorTipo`, `rankingTipos`,
  `beaufort` e `descreveTipo` do estudo.
- Create: `lib/criterios/dominante-rodizio.ts`, com
  `dominanteRodizio(entrada, contexto, modo: "abs" | "rel")`, porte da função do estudo, inclusive
  "sem repetição imediata", `pulados` e `motivo`.
- Create: `lib/criterios/criterio-b.ts` e `lib/criterios/criterio-d.ts`.
  - `sorteio = "deterministico"` e `usaMemoria = true`.
  - O D tem `usaNormal = true`, e com `normal === null` o `motivo` termina com "Sem normal do
    lugar: igual ao B."
- Create: `lib/criterios/normais-do-estudo.ts`, com
  `NORMAIS_DO_ESTUDO: Record<cidade, Record<mes, Record<"3" | "15", Record<variavel, [mu, sd]>>>>`
  extraído de `GAIA_DATA.normals` pelo mesmo script descartável, e
  `normalDe(cidade, mes, periodo: "dia" | "noite"): NormalDoLugar | null`.
- Test: `tests/criterio-b-d.test.ts`

- [ ] **Step 1: Escrever os testes que falham:**
  - `B equivale ao estudo em 3000 climas`: `vencedor`, `escolha` e `S` iguais, com memória vazia e
    `snowfall: null` no oráculo.
  - `B equivale ao estudo numa sequência de 60 escolhas com memória`: a cada passo,
    `memoria[escolha] = i` nos dois lados.
  - `D equivale ao estudo com o normal de São Paulo/11/15 h e de Ulan Bator/1/3 h`.
  - `os 8 cenários do estudo`, com os casos de `renderTests` e os valores copiados de lá. Cada
    caso, com o `vencedor` esperado:

    | Caso | Vencedor |
    |---|---|
    | P1 como escrito | raios |
    | P1 como antes do PR #243 | raios |
    | Dia limpo | calmaria |
    | Ulan Bator | frio |
    | Queimada | fogo |
    | Chuva forte | chuva |
    | Calor de 39 °C | calor |
    | Fontes fora do ar | calmaria |
  - `sem repetição imediata`: um tipo com uma obra só que acabou de tocar passa a vez.
  - `D sem normal = B`.
  - `tudo null → calmaria, sem lançar`.
- [ ] **Step 2:** Rodar `npm test` (FAIL). **Step 3:** Implementar. **Step 4:** Rodar
  `npm test && npx tsc --noEmit` (verde).
- [ ] **Step 5:** Commitar com
  `git commit -m "feat(criterios): salience base and criteria B and D with rotation memory"`.

### Task 6: Critério C · Aderência por obra

**Files:**
- Create: `lib/criterios/criterio-c.ts`, porte de `aderencia`, `criterioC` e `tipoMaisSaliente`.
  `sorteio = "ponderado"`, com as candidatas na ordem do catálogo.
- Test: `tests/criterio-c.test.ts`

- [ ] **Step 1: Escrever os testes que falham:**
  - `C equivale ao estudo em 3000 climas`: as mesmas `probs` (diferença menor que 1e-12), o mesmo
    `vencedor` e o mesmo `top`.
  - `probabilidades somam 1`.
  - `obra sem entrada meteorológica fica no piso`.
  - `tudo null não lança`.
- [ ] **Step 2:** Rodar `npm test` (FAIL). **Step 3:** Implementar. **Step 4:** Rodar
  `npm test && npx tsc --noEmit` (verde).
- [ ] **Step 5:** Commitar com `git commit -m "feat(criterios): criterion C, adherence per work"`.

### Task 7: Instância do Gerenciador + regra de áudio pura

**Files:**
- Modify: `lib/criterios/gerenciador.ts`, que passa a exportar `CRITERIO_PADRAO_ID = "atual"` e
  `gerenciador = new GerenciadorDeCriterios([atual, A, B, C, D], CRITERIO_PADRAO_ID)`.
- Create: `components/compositions/composition-audio.ts`. Recebe `AudioCondition`, `AudioRule`,
  `CompositionAudio`, `CompositionManifest`, `cabe` e `resolveAudio`, movidos de
  `composition-data.ts`, que passa a reexportá-los.
- Test: `tests/criterios-gerenciador.test.ts` e mais um caso em `tests/composition-runtime.test.ts`.

- [ ] **Step 1: Escrever os testes que falham:**
  - `gerenciador real tem os 5, nesta ordem, e o padrão é atual`.
  - `avaliarTodos roda os 5 em menos de 50 ms no total` (folga de CI).
  - `resolveAudio do módulo puro aplica a regra do bonfire`: `{fireCount:12, closeFires:3}` dá
    `FOGO-AA.mp3`, `{12, 0}` dá `FOGO-AB.mp3` e `{0, 0}` dá `FOGO-BB.mp3`.
- [ ] **Step 2:** Rodar `npm test` (FAIL). **Step 3:** Implementar. **Step 4:** Rodar
  `npm test && npx tsc --noEmit && npm run lint` (verde).
- [ ] **Step 5:** Commitar com
  `git commit -m "feat(criterios): register the five criteria; audio rule importable in the browser"`.

### Task 8: Produção — o `/map3` escolhe pelo Gerenciador

**Files:**
- Create: `lib/criterios/entrada-do-site.ts`, com
  `paraEntradaClima(fontes: { weatherData; lightningData; fireSpotsData; lat: number; lng: number }): EntradaClima`.
- Create: `lib/criterios/cookies.ts`, com:
  - `COOKIE_CRITERIO = "gaia_criterio"`;
  - `cookieDoRodizio(id) → "gaia_rodizio_<id>"`;
  - `lerIdDoCriterio(v): string | null`;
  - `lerMemoria(v, catalogo): MemoriaDeRodizio`;
  - `escreverMemoria(memoria, obra, tick): string`.
- Create: `app/[locale]/map3/avancar-rodizio.tsx`, um cliente que grava o cookie ao montar.
- Create: `app/[locale]/map3/aviso-criterio-de-teste.tsx`, texto pequeno com
  `pointer-events: none`.
- Modify: `app/[locale]/map3/page.tsx:102-120` para escolher pelo Gerenciador, `:227-238` para não
  montar o `DataSender` com teste ativo, e o render para incluir `AvancarRodizio` e o aviso.
- Modify: `messages/pt.json` e `messages/en.json`, com a chave `Index.criterioDeTeste`
  ("Critério de teste neste navegador: {nome}" e "Test criterion in this browser: {nome}").
- Test: `tests/criterios-producao.test.ts`

- [ ] **Step 1: Escrever os testes que falham:**
  - `paraEntradaClima`: NaN e undefined viram null, e `closeFires` conta os eventos com
    `dist < 50`.
  - `sem cookie, a escolha é idêntica à de hoje`. A cópia congelada do bloco `page.tsx:102-117`
    entra como oráculo e é comparada ao caminho novo em 2000 casos de fontes, inclusive as
    indisponíveis, com o mesmo `r`.
  - `lerIdDoCriterio`: `"B"` dá `"B"`, e `"../x"`, `"a".repeat(40)`, `""` e `undefined` dão `null`.
  - `lerMemoria`: JSON inválido dá `{}`; 3 KB dão `{}`; um id desconhecido é descartado; `NaN` e
    `"1"` são descartados.
  - `escreverMemoria` faz a ida e volta com `lerMemoria`.
- [ ] **Step 2:** Rodar `npm test` (FAIL). **Step 3:** Implementar. **Step 4:** Rodar
  `npm test && npx tsc --noEmit && npm run lint` (verde).
- [ ] **Step 5:** Com o plugin Playwright e `npm run dev`:
  - sem cookie, `/pt/map3` → player: abre uma obra da lista do critério atual, sem aviso, e o
    `DataSender` grava como hoje (`insertSatelliteData` chamado);
  - com `gaia_criterio=B`: aparece o aviso, nada é gravado e o cookie `gaia_rodizio_B` avança a
    cada obra tocada.
- [ ] **Step 6:** Rodar `graphify update .` e commitar com
  `git commit -m "feat(map3): choose through the criteria manager; per-browser test criterion"`.

### Task 9: Simulador — lógica pura

**Files:**
- Create: `app/[locale]/simulator/cenario.ts`, `selecao.ts`, `troca-de-patch.ts` e `canais.ts`
- Test: `tests/simulador-logica.test.ts`

**Interfaces — Produces:**
```ts
// cenario.ts
export type Cenario = { valores: Record<NomeEntrada, number>; climaIndisponivel: boolean; sateliteIndisponivel: boolean;
  normalRef: { cidade: string; mes: number; periodo: "dia" | "noite" }; foco: IdCriterio };
export const ENTRADAS: readonly { nome: NomeEntrada; rotulo: string; unidade: string; faixa: [number, number]; passo: number; grupo: "criterio" | "obra" }[];
export const PRESETS: readonly { id: string; nome: string; cenario: Cenario }[];   // os 10 do estudo; padrão "limpo"
export function lerCenario(p: URLSearchParams): { cenario: Cenario; veioDaUrl: boolean };
export function escreverCenario(p: URLSearchParams, c: Cenario): URLSearchParams;  // remove play; lng = lon
export function entradaEfetiva(c: Cenario): EntradaClima;                           // indisponível → null; closeFires ≤ fireCount
export function paraPropsDaObra(c: Cenario, atributos: readonly string[]): Record<string, number>;
// selecao.ts
export type Selecao = { obra: DeclaredCompositionName | null; origem: "criterio" | "manual" };
export function proximaSelecao(anterior: Selecao | null, r: ResultadoDeDecisao): Selecao;
export function escolherManual(anterior: Selecao, r: ResultadoDeDecisao, obra: DeclaredCompositionName): Selecao;
// troca-de-patch.ts
export function patchDaObra(obra: DeclaredCompositionName, manifest: CompositionManifest): string | null;
export function decidirAcaoDePatch(e: { desejado: string | null; ativo: string | null; carregando: boolean; parando: boolean }): "esperar" | "parar" | "iniciar" | "nada";
// canais.ts
export function canaisDoCenario(e: EntradaClima, receivers: Record<string, string>): [receiver: string, valor: number][];
```

- [ ] **Step 1: Escrever os testes que falham:**
  - `cenario`:
    - sem atributos na URL (só `lat`/`lng`/`mode`), o resultado é o preset "limpo";
    - a ida e volta preserva tudo;
    - clamp: `temperature=999` dá 55 e `rain=abc` dá o padrão;
    - `closeFires` é limitado por `fireCount`;
    - `escrever` remove `play`;
    - `entradaEfetiva` com `climaIndisponivel` deixa null as 7 do clima e mantém as contagens;
    - os 10 presets são válidos dentro das faixas.
  - `selecao`:
    - uniforme: a mesma obra se mantém enquanto continua candidata, e entra a `escolha` nova quando
      ela sai;
    - determinístico: segue a `escolha`;
    - manual: vale enquanto continua candidata;
    - uma escolha manual fora das candidatas é ignorada.
  - `troca-de-patch`:
    - `carregando` dá sempre `esperar`;
    - ativo diferente do desejado dá `parar`;
    - nada ativo com um desejado dá `iniciar`;
    - `desejado` null com um ativo dá `parar`;
    - igual dá `nada`;
    - `patchDaObra`: curves e cloudBubble dão `mapa15`, lluvia dá `bubble1`, lightningBolts dá
      `thunder4`, nightRain dá `rain2` e bonfire dá `null`.
  - `canais`: `{"gaia.temp":"temp"}` dá `[["temp", t]]`, e `{}` dá `[]`. Um valor null não é
    enviado.
- [ ] **Step 2:** Rodar `npm test` (FAIL). **Step 3:** Implementar. **Step 4:** Rodar
  `npm test && npx tsc --noEmit` (verde).
- [ ] **Step 5:** Commitar com
  `git commit -m "feat(simulator): scenario, selection and patch-switch logic"`.

### Task 10: Motor da placa (puro e genérico)

**Files:**
- Create: `app/[locale]/simulator/layout-placa.ts`
- Test: `tests/simulador-layout-placa.test.ts`

**Interfaces — Produces:**
```ts
export type Trilha = { id: string; de: string; para: string; pontos: [number, number][]; ativa: boolean; intensidade: number; direta?: boolean };
export type GeometriaPlaca = { largura: number; altura: number; alturaLinha: number;
  nos: (NoDoCircuito & { x: number; y: number; largura: number; altura: number })[]; trilhas: Trilha[]; j1: { x: number; y: number } };
export function montarPlaca(circuito: Circuito, entradasSoDaObra: readonly NomeEntrada[]): GeometriaPlaca;
```

- [ ] **Step 1: Escrever os testes que falham.** Cada um roda para o circuito real dos 5 critérios,
  avaliados no preset "limpo" e no "temporal":
  - `nenhum nó se sobrepõe`;
  - `toda ligação vira trilha`, com as pontas nos pinos dos nós;
  - `trilhas só usam 0°, 45° e 90°`: em cada segmento, `dx === 0`, `dy === 0` ou
    `|dx| === |dy|`;
  - `as entradas só da obra têm trilha direta até o J1`;
  - `determinístico`: a mesma entrada dá a mesma geometria.
- [ ] **Step 2:** Rodar `npm test` (FAIL). **Step 3:** Implementar. São 5 colunas fixas, em que a
  ordem dos nós é a do circuito, e faixas por ligação no vão entre as colunas. **Step 4:** Rodar
  `npm test && npx tsc --noEmit` (verde).
- [ ] **Step 5:** Commitar com
  `git commit -m "feat(simulator): generic circuit-board layout for any criterion"`.

### Task 11: Página, comparação e placa (UI)

**Files:**
- Create: `app/[locale]/simulator/page.tsx`, com `generateMetadata`, o catálogo e os manifestos como
  props, e `<Pd4WebProvider><Suspense>`.
- Create: `app/[locale]/simulator/simulador.tsx`. É o estado: avalia tudo a cada mudança, guarda
  as memórias por critério, sincroniza a URL e monta o resumo `aria-live`.
- Create: `comparacao.tsx`, `placa-circuito.tsx`, `trimpot.tsx`, `sete-segmentos.tsx`,
  `interruptor.tsx` e `simulador.module.css` (tokens D4, a "corrente" e o
  `prefers-reduced-motion`), todos em `app/[locale]/simulator/`.

**Atributos de teste:**
- `data-criterio`, `data-foco` e `data-padrao` nas linhas da comparação;
- `data-trilha`, `data-energizada`, `data-no` e `data-destaque` na placa;
- `data-entrada` nos trimpots.

- [ ] **Step 1:** Implementar a página, sem o módulo da obra. Entram:
  - entradas, interruptores e o normal de referência;
  - presets e "Copiar link do cenário";
  - comparação e foco;
  - "Usar este critério neste navegador" / "Voltar ao padrão neste navegador", via `document.cookie`;
  - SW1, a escolha manual pelos LEDs e "Zerar memória".
- [ ] **Step 2:** Com `npm run dev` e o plugin Playwright, tirar screenshots em 1440×900, 1024×768
  e 390×844 e criticar contra a D4: clichê, contraste, alinhamento SVG↔HTML, foco visível,
  legibilidade da placa do C, que é a mais densa. Ajustar até passar.
- [ ] **Step 3:** Verificar:
  - `grep -rn "simulator" app components --include=*.tsx | grep -v "app/\[locale\]/simulator"`
    não encontra nada;
  - `grep -rnE "DataSender|supabase|CompositionControls" "app/[locale]/simulator"` não encontra
    nada;
  - o `<head>` sai com `noindex, nofollow` e sem canonical para `/map3`.
- [ ] **Step 4:** Rodar `npx tsc --noEmit && npm run lint && npm test` (verde).
- [ ] **Step 5:** Rodar `graphify update .` e commitar com
  `git commit -m "feat(simulator): hidden route comparing criteria on a circuit board"`.

### Task 12: Módulo da obra e áudio

**Files:**
- Create: `app/[locale]/simulator/modulo-obra.tsx`. Cuida de:
  - o monitor escalado e a Tela cheia;
  - Tocar e Parar;
  - a `key` de remontagem, com debounce de cerca de 500 ms sobre os atributos declarados;
  - o escudo do airports;
  - a legenda do áudio e o aviso "o patch não lê o clima".
- Create: `app/[locale]/simulator/use-audio-da-obra.ts`. Faz a reconciliação por
  `decidirAcaoDePatch`, o envio por `canaisDoCenario`, o `stopPatch()` no desmonte e o Tone parado
  ao sair do airports.
- Modify: `simulador.tsx`, que pluga o módulo à seleção do critério em foco, com debounce de cerca
  de 400 ms. Tocar avança a memória daquele critério.

**Consumes:**
- `CLIENT_SKETCHES` (Tarefa 2) e `resolveAudio` (Tarefa 7);
- `patchDaObra`, `decidirAcaoDePatch` e `canaisDoCenario` (Tarefa 9);
- `usePd4Web` (`app/[locale]/map3/pd4web-context.tsx`: `activePatch`, `loadingPatch`,
  `isStopping`, `startPatch`, `stopPatch`, `pd4web`);
- `Player` (`components/compositions/my-player.tsx`).

- [ ] **Step 1:** Implementar o módulo e o hook.
- [ ] **Step 2:** Verificar pelo plugin Playwright:
  - "Tocar obra" no preset do Belém faz o canvas aparecer;
  - com `lluvia` escolhida à mão, o status mostra `bubble1`;
  - no preset "Queimada no cerrado", com foco no critério 0 e `bonfire` escolhida à mão, a legenda
    mostra `mp3 · FOGO-AA.mp3`.
- [ ] **Step 3:** Rodar `npx tsc --noEmit && npm run lint && npm test` (verde).
- [ ] **Step 4:** Rodar `graphify update .` e commitar com
  `git commit -m "feat(simulator): render and play the selected work with simulated values"`.

### Task 13: E2E com o plugin Playwright, script repetível e portões da CI

**Files:**
- Create: `scripts/teste-simulador.mjs`, com playwright-core, no padrão de
  `scripts/teste-canvas-responsivo.mjs` (BASE e CHROME por env, SwiftShader), fora da CI.

**Medição de áudio** (WSL2: sem caixa de som e sem microfone; **nunca** `getUserMedia`):
- **Init script**, instalado com `page.addInitScript` via `browser_run_code_unsafe`. Ele envolve
  `AudioNode.prototype.connect`: toda ligação a um `AudioDestinationNode` também vai a um
  `AnalyserNode` em `window.__taps`, cobrindo Pd, Tone e p5.sound.
- **Também no init script**: envolve `HTMLMediaElement.prototype.play` para guardar o elemento em
  `window.__midias`.
- **Conferência**: o RMS sai do `getFloatTimeDomainData` dos taps. Para o mp3, conferem-se
  `!paused`, o `currentTime` andando e o `src`.
- **Controle positivo antes de tudo**: um oscilador de 0,3 deve dar RMS ≈ 0,212 com o relógio
  andando. Relógio parado é falha de ambiente: repetir.
- **Canvas**: contagem **exata** de pixels não pretos.

- [ ] **Step 1:** Subir `npm run dev` e rodar o controle positivo. Esperado: RMS entre 0,20 e 0,22.
- [ ] **Step 2:** Carregar `/pt/simulator`. Esperado: 0 erros no console, 0 `getUserMedia`,
  `noindex` no `<head>` e 5 linhas na comparação.
- [ ] **Step 3:** Abrir a frio um link copiado. Esperado: o cenário, o foco e a obra reproduzidos,
  nenhum contexto `running` e a obra montada só depois de "Tocar obra".
- [ ] **Step 4:** Nos 10 presets, o vencedor de cada critério na UI tem que bater com o
  `gerenciador.avaliarTodos` rodado no Node para o mesmo cenário (tabela impressa pelo teste). Com
  os interruptores "clima" e "satélite" desligados, B, C e D dão calmaria, e o 0 dá o que o 0 dá
  com zeros.
- [ ] **Step 5:** Tocar, medindo o áudio:
  - Belém, com `lluvia` à mão: RMS do tap > 0 e pixels > 0;
  - "Queimada no cerrado", com bonfire à mão: só 1 contexto `running` e o mp3 tocando `FOGO-AA`.
    Com `closeFires` = 0, passa a `FOGO-AB`.
- [ ] **Step 6:** Trocar rápido de obra, com `page.route` atrasando o `.wasm` em 6 s e 4 trocas
  entre lluvia, lightningBolts e nightRain. Esperado: no fim, `activePatch` é o último pedido, há
  1 contexto `running` e os órfãos têm RMS 0.
- [ ] **Step 7:** Testar o rodízio com foco no B, no preset "Dia limpo" (calmaria). Esperado:
  tocar seguidas vezes percorre as obras de Calmaria do catálogo sem repetir uma antes de esgotar as
  outras (a ordem vem de `dominanteRodizio` no Node), e "Zerar memória" volta ao começo. A remontagem no stormEye dá 1 canvas visível, e mexer num dado que ela não usa não a
  reinicia.
- [ ] **Step 8:** Testar o airports. Esperado: RMS do Tone > 0; o clique dentro da obra não muda
  `location.search`; trocar de obra leva o RMS do Tone a 0.
- [ ] **Step 9:** Testar o Parar e a saída. "Parar" deve deixar os taps em 0 e o mp3 `paused`.
  Navegar para `/pt/map3` com som tocando não deve deixar nenhum contexto `running` do simulador.
- [ ] **Step 10:** Testar o "Usar este critério neste navegador" (B). Em `/pt/map3` deve aparecer o
  aviso, sem gravação no GaiaLogs. "Voltar ao padrão" deve tirar o aviso.
- [ ] **Step 11:** Emular `prefers-reduced-motion` e tirar screenshots finais em 1440, 1024 e 390.
  Esperado: `animation-name: none` nas trilhas.
- [ ] **Step 12:** Escrever `scripts/teste-simulador.mjs` com os passos 1, 2, 4, 5 e 9 e rodar
  `node scripts/teste-simulador.mjs`. Esperado: todos OK, com os números impressos.
- [ ] **Step 13:** Rodar os portões da CI:
  `npx tsc --noEmit && npm run lint && npm run compositions:validate && npm test && npm run patches:check && npm run build`.
  Esperado: verde.
- [ ] **Step 14:** Rodar `graphify update .` e commitar com
  `git commit -m "test(simulator): repeatable e2e of criteria, audio and canvas"`.

## Execução

Recomendo a execução **Subagent-driven** (superpowers:subagent-driven-development):
- As Tarefas 1–8 mudam o caminho que escolhe as obras no site público. Um revisor novo por tarefa,
  conferindo cada porte contra o oráculo, é a melhor proteção contra uma divergência silenciosa.
- As Tarefas 11–13 são visuais, e o mesmo executor deve iterar com screenshots.
- No fim, a skill finishing-a-development-branch apresenta as opções de push/PR, sem executar nada
  sem o OK do Nycholas.

## Ao final (fora das tarefas)

- Relatar ao Nycholas o bug do map3 (a parada pendente perdida no merge do PR #217) e oferecer um PR
  separado.
- Lembrar que, para trocar o padrão global, falta antes a coluna do critério no GaiaLogs.
- Atualizar a memória do projeto.
