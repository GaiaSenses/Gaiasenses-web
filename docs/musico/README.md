# Guia de quem cria para o GaiaSenses

O GaiaSenses transforma o clima de um lugar real em imagem e som. Você aponta o
globo para algum ponto do planeta, o site busca a temperatura, a chuva, os raios
e as queimadas daquele lugar naquele momento, e entrega esses números para as
obras que estão no ar.

Este guia é para quem quer colocar uma obra lá dentro. Há **dois caminhos**, e
você pode seguir um, o outro, ou os dois juntos:

| Você faz | O caminho | Onde está |
|---|---|---|
| 🎹 Som, num patch de **Pure Data** | O patch escuta canais `gaia.*` | [Caminho A](#caminho-a-um-patch-de-pure-data) |
| 🎬 Imagem, num sketch de **p5.js** | A animação declara os dados que usa | [Caminho B](#caminho-b-uma-animação-p5js) |
| 🎼 Os dois, tocando juntos | Um envio só, com a ligação declarada | [Os dois juntos](#os-dois-juntos) |

Nos dois casos você envia pelo **site do GitHub**, sem linha de comando, e em
alguns minutos recebe um link para ver e ouvir a sua obra dentro do GaiaSenses,
com dados reais.

**Sem instalar nada além da ferramenta em que você já trabalha, e sem depender de
um programador.**

---

## Antes de tudo

### Uma conta no GitHub

O GitHub é onde o projeto guarda tudo. Você vai usá-lo só pelo navegador. Se ainda
não tem conta:

1. Acesse [github.com/signup](https://github.com/signup).
2. Informe e-mail, senha e um nome de usuário.
3. Confirme o e-mail que eles enviam.

É gratuito e leva uns três minutos.

### Um convite para o projeto

Ter conta não basta: alguém da equipe precisa te dar acesso ao repositório. Depois
de criar a conta, mande o seu nome de usuário para a equipe. Pode copiar esta
mensagem:

> Oi! Criei minha conta no GitHub, meu usuário é **@seu-usuario**. Pode me
> adicionar como colaborador no repositório Gaiasenses-web? Quero enviar uma obra.

Você vai receber um e-mail de convite. **Aceite antes de continuar** — sem isso o
botão de enviar arquivos não aparece.

### Um navegador atualizado

Chrome, Edge ou Firefox recentes. Para ouvir, prefira fone de ouvido; no celular,
tire do modo silencioso.

### A ferramenta da sua obra

- Para um patch: o **Pure Data vanilla**, de [puredata.info](https://puredata.info).
- Para uma animação: nada além de um editor de texto. Se você já usa o
  [OpenProcessing](https://openprocessing.org) ou o editor do p5, o código de lá
  serve de ponto de partida.

---

# Caminho A: um patch de Pure Data

## Como organizar a pasta

O compilador exige uma organização específica. Não é capricho: é o que ele
entende.

```
minha-peca/
├── main.pd          o patch principal, com esse nome exato
├── patch.json       a ficha da obra (adiante)
├── Libs/            todas as suas abstrações .pd vão aqui
│   ├── minhaAbs.pd
│   └── outraAbs.pd
├── Audios/          arquivos .wav ou .aif, se a peça usar
└── Extras/          imagens e outros arquivos
```

Três regras causam quase todos os erros:

1. O patch principal **precisa se chamar `main.pd`** e ficar na raiz da pasta.
2. Todas as abstrações vão **dentro de `Libs/`**. Nenhuma solta na raiz.
3. O `main.pd` precisa conter o objeto `[declare -path Libs]`. Sem ele o Pd não
   encontra as suas abstrações. Basta um, em qualquer lugar do patch.

> ⚠️ **A armadilha silenciosa: maiúsculas e minúsculas importam.**
> Se o arquivo se chama `MinhaAbs.pd` e você escreve `[minhaabs]`, funciona no seu
> Mac e quebra no servidor. O sistema avisa quando isso acontece, mas é melhor já
> nascer certo.

> **Limitação conhecida.** O compilador aceita **apenas um _graph_** no patch
> principal — aquelas caixas com "graph on parent" ligado. Se você usa várias,
> mova-as para dentro de abstrações em `Libs/`.

## Escolha os dados que a peça vai escutar

Para receber um dado do mundo, coloque no patch um objeto de _receive_ com o nome
do dado:

```
[r gaia.temp]     <- a temperatura do lugar para onde o globo está apontando
```

**É só isso.** Não existe arquivo de configuração para preencher, nem ninguém para
avisar. Quando você enviar o patch, o sistema lê os objetos que você usou e liga
tudo sozinho.

### Vem do globo

| Coloque no patch | O que chega | Faixa |
|---|---|---|
| `[r gaia.lat]` | Latitude do centro do mapa | −90 a 90 ° |
| `[r gaia.lon]` | Longitude do centro do mapa | −180 a 180 ° |
| `[r gaia.speed]` | Velocidade de rotação do globo | 0 a 180 °/s |

### Vem do clima do lugar

| Coloque no patch | O que chega | Faixa |
|---|---|---|
| `[r gaia.temp]` | Temperatura do ar | −60 a 55 °C |
| `[r gaia.humidity]` | Umidade relativa | 0 a 100 % |
| `[r gaia.clouds]` | Cobertura de nuvens | 0 a 100 % |
| `[r gaia.rain]` | Chuva na última hora | 0 a 100 mm/h |
| `[r gaia.wind.speed]` | Velocidade do vento | 0 a 60 m/s |
| `[r gaia.wind.deg]` | Direção do vento | 0 a 360 ° |
| `[r gaia.lightning]` | Raios detectados por perto | 0 a 500 |
| `[r gaia.fire]` | Focos de queimada por perto | 0 a 500 |

### Vem do sensor Bolota

| Coloque no patch | O que chega | Faixa |
|---|---|---|
| `[r gaia.acc.x]` | Aceleração no eixo X | −16 a 16 g |
| `[r gaia.acc.y]` | Aceleração no eixo Y | −16 a 16 g |
| `[r gaia.acc.z]` | Aceleração no eixo Z | −16 a 16 g |
| `[r gaia.co2]` | CO₂ medido pelo sensor | 400 a 5000 ppm |

Os canais do sensor só chegam quando o Bolota está conectado. Os de clima mudam
quando o público move o globo para outro lugar — não são contínuos.

### O seu patch também pode falar de volta

Mande uma lista de dois valores — latitude e longitude — para `[s gaia.out]` e o
globo vai para lá. É o patch dirigindo o visual.

### Se a peça toca junto com uma animação

Algumas animações avisam o que estão fazendo. Esses nomes pertencem à animação e
valem para qualquer patch que toque com ela.

| Animação | Coloque no patch | Quando chega |
|---|---|---|
| `lightningBolts` | `[r bolt]` | um _bang_ a cada raio desenhado |
| `lluvia` | `[r start]` | uma vez, quando a chuva aparece |
| `lluvia` | `[s paint]` | mande um _bang_ e nasce uma gota na tela |

A lista completa e sempre atualizada está em [vocabulario.md](vocabulario.md).

## Um patch que funciona

O mais simples possível usando dados reais. A temperatura vira a altura de uma
nota: quanto mais quente o lugar, mais aguda.

```
[r gaia.temp]
|
[clip -10 45]        <- protege contra valores absurdos
|
[* 8]
|
[+ 220]              <- 20 °C vira 380 Hz, 30 °C vira 460 Hz
|
[osc~]
|
[*~ 0.05]            <- volume baixo, cuide dos ouvidos de quem escuta
|
[dac~]
```

Ele está pronto no projeto, em [`patches/exemplo-clima/`](../../patches/exemplo-clima/).
Copie e mexa à vontade.

## A ficha da obra: `patch.json`

Na mesma pasta, um arquivo com esse nome exato:

```json
{
  "$schema": "../../schemas/gaia.patch.schema.json",
  "schemaVersion": 1,
  "id": "minha-peca",
  "label": "Minha Peça",
  "description": "Uma frase sobre a obra.",
  "author": { "name": "Seu Nome" },
  "license": "CC-BY-4.0",
  "build": { "initialMemory": 64 },
  "activation": {
    "moments": ["player"],
    "compositions": ["lightningBolts"]
  }
}
```

- `id` precisa ser igual ao nome da pasta. Minúsculas e hífen.
- `moments`: use `"player"` se a peça toca junto com uma animação, ou `"map"` se
  ela é a paisagem sonora do globo.
- `compositions`: com qual animação ela toca. Remova a linha se for som do globo.
- `initialMemory`: 64 MB serve para quase tudo. Suba para 128 ou 256 se a peça tem
  muitas vozes ou samples grandes.

### Três cuidados que valem a peça

- **Sempre limite a faixa de entrada** com `[clip]`. Um sensor com defeito ou uma
  API fora do ar pode mandar um número estranho, e você não quer que isso vire um
  estouro no alto-falante.
- **Os dados chegam devagar.** O clima só muda quando o público move o globo. Se
  você quer movimento contínuo, use o dado como _destino_ e interpole no Pd — com
  `[line]`, por exemplo.
- **Comece em volume baixo.** A peça pode tocar numa exposição, com o volume do
  sistema alto.

Agora pule para [A jornada, do envio ao ar](#a-jornada-do-envio-ao-ar).

---

# Caminho B: uma animação p5.js

Uma animação declara **quais dados do clima ela usa**, e o site entrega esses
dados prontos. Você não busca nada, não chama nenhuma API, não trata erro de rede:
os números chegam como propriedades do seu sketch.

## Como organizar a pasta

```
compositions/minha-animacao/
├── composition.json     a ficha da obra
└── sketch.tsx           o seu p5
```

O nome da pasta usa **minúsculas e hífen** (`chuva-de-verao`). São só esses dois
arquivos — e, se a obra tiver som próprio, os `.mp3` vão em `public/audios/`.

## A ficha da obra: `composition.json`

```json
{
  "id": "chuvaDeVerao",
  "label": "Chuva de Verão",
  "author": "Seu Nome",
  "license": "CC-BY-4.0",
  "openProcessingLink": "https://openprocessing.org/sketch/000000",
  "attributes": ["rain", "temperature"],
  "audio": { "kind": "none" },
  "thumb": "chuva-de-verao.png"
}
```

| Campo | Obrigatório | O que é |
|---|---|---|
| `id` | sim | O nome interno, em `camelCase`. Vira o endereço da obra |
| `label` | sim | Como ela aparece na tela |
| `attributes` | sim | Os dados que a animação usa. A lista está abaixo |
| `audio` | sim | De onde vem o som. Três formas, adiante |
| `thumb` | sim | A miniatura, um arquivo dentro de `public/` |
| `author` | não | Quem assina |
| `license` | não | O padrão do projeto é `CC-BY-4.0` |
| `openProcessingLink` | não | Se a obra também vive lá |

> O `id` é `camelCase` e o nome da pasta é `com-hífen`. Parece pegadinha, mas há
> um motivo: a pasta é um nome de arquivo e o `id` vira um identificador dentro do
> código. `chuva-de-verao` / `chuvaDeVerao`.

## Os dados que a animação pode pedir

Escreva em `attributes` só o que a obra realmente lê. Pedir um dado que não se usa
faz o site buscar informação à toa.

| Nome | O que chega | Faixa |
|---|---|---|
| `temperature` | Temperatura do ar | −60 a 55 °C |
| `humidity` | Umidade relativa | 0 a 100 % |
| `clouds` | Cobertura de nuvens | 0 a 100 % |
| `rain` | Chuva na última hora | 0 a 100 mm/h |
| `windSpeed` | Velocidade do vento | 0 a 60 m/s |
| `windDeg` | Direção do vento | 0 a 360 ° |
| `lightningCount` | Raios detectados por perto | 0 a 500 |
| `fireCount` | Focos de queimada por perto | 0 a 500 |
| `closeFires` | Focos a menos de 50 km | 0 a 500 |
| `lat` | Latitude do centro do mapa | −90 a 90 ° |
| `lon` | Longitude do centro do mapa | −180 a 180 ° |

**Cada dado tem um nome só.** Não existe apelido nem grafia alternativa: é
`windSpeed`, nunca `windspeed`. Se você errar, o sistema recusa o envio e sugere a
grafia certa — em vez de aceitar em silêncio e deixar o valor parado em zero, que
é o que acontecia antes.

## O sketch

O contrato é curto: **exporte um componente por padrão, e ele recebe os dados que
você declarou, cada um com o nome exato do `attributes`, mais um `play`.**

```tsx
"use client";
import type { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
import { NextReactP5Wrapper } from "@p5-wrapper/next";

export type ChuvaDeVeraoProps = {
  play: boolean;
  temperature: number;
  rain: number;
};

function sketch(p5: P5CanvasInstance<SketchProps & ChuvaDeVeraoProps>) {
  let temperature = 0;
  let rain = 0;
  let play = false;

  p5.setup = () => {
    p5.createCanvas(p5.windowWidth, p5.windowHeight);
    p5.colorMode(p5.HSB, 255);
    p5.noStroke();
    if (!play) p5.noLoop();
  };

  // Chamado sempre que um dado muda — é por aqui que o clima entra.
  p5.updateWithProps = (props: ChuvaDeVeraoProps) => {
    if (!Number.isNaN(props.temperature)) temperature = props.temperature;
    if (!Number.isNaN(props.rain)) rain = props.rain;
    play = props.play;
    if (play) p5.loop();
    else p5.noLoop();
  };

  p5.draw = () => {
    const matiz = p5.map(temperature, -10, 45, 160, 0, true);
    p5.background(matiz, 180, 90);
    p5.fill(matiz, 60, 255);
    for (let i = 0; i < rain * 4; i++) {
      p5.circle(p5.random(p5.width), p5.random(p5.height), 3);
    }
  };
}

export default function ChuvaDeVeraoSketch(props: ChuvaDeVeraoProps) {
  return <NextReactP5Wrapper sketch={sketch} {...props} />;
}
```

Esse exemplo está pronto no projeto, em
[`compositions/exemplo-clima/`](../../compositions/exemplo-clima/). Copie a pasta,
troque o nome e comece dali.

### Três coisas que salvam tempo

- **Respeite o `play`.** Quando ele é falso a obra está fora de cena; chame
  `p5.noLoop()` e pare de desenhar. Uma animação que roda escondida come bateria
  de quem só está olhando o mapa.
- **Nunca confie no valor bruto.** Use `p5.map(..., true)` com o quarto argumento,
  ou `p5.constrain`, para prender o valor na faixa que a obra aguenta. Um dia de
  tempestade pode mandar um número muito maior do que você testou.
- **Zero é um valor legítimo.** Sem chuva, `rain` vale 0 — e a obra precisa
  continuar bonita assim, porque é o estado mais comum.

### Vindo do OpenProcessing?

O código de lá quase sempre funciona com três ajustes:

1. Envolva o seu código na função `sketch(p5)` acima e troque as chamadas soltas
   por `p5.` na frente — `background(0)` vira `p5.background(0)`.
2. `function setup()` vira `p5.setup = () => {}`, e o mesmo para `draw`.
3. Onde você usava um `slider` ou um número fixo para experimentar, use o dado do
   clima.

## De onde vem o som da animação

Três formas, no campo `audio`:

### 1. Nenhum som

```json
"audio": { "kind": "none" }
```

A obra é silenciosa, ou o som virá depois.

### 2. Um patch de Pure Data

```json
"audio": { "kind": "patch" }
```

O som vem de um patch que declara tocar com esta animação. Veja
[Os dois juntos](#os-dois-juntos).

### 3. Arquivos de áudio que você fornece

O caso mais comum quando a obra não usa Pd. Coloque os `.mp3` em `public/audios/`
e diga **quando cada um toca**.

Um arquivo fixo:

```json
"audio": { "kind": "mp3", "file": "chuva.mp3" }
```

Ou uma regra por faixa de valor — o som acompanha o clima:

```json
"audio": {
  "kind": "mp3",
  "rules": [
    { "when": { "rain": { "max": 0 } },   "file": "" },
    { "when": { "rain": { "below": 3 } }, "file": "chuva-leve.mp3" },
    { "when": { "rain": { "below": 6 } }, "file": "chuva-media.mp3" },
    { "file": "chuva-forte.mp3" }
  ]
}
```

**Vale a primeira regra que couber, de cima para baixo.** Um `file` vazio (`""`) é
silêncio declarado — sem chuva, nenhum som.

Os quatro operadores:

| Operador | Significa |
|---|---|
| `min` | maior ou igual a |
| `max` | menor ou igual a |
| `above` | estritamente maior que |
| `below` | estritamente menor que |

Uma regra pode olhar **dois dados ao mesmo tempo**, e aí os dois precisam bater:

```json
{ "when": { "fireCount": { "min": 4 }, "closeFires": { "min": 2 } },
  "file": "fogo-intenso.mp3" }
```

> **Deixe a última regra sem `when`.** Ela é a que cobre todo o resto. Sem isso
> existe um estado do clima em que a obra fica muda, e o sistema te avisa disso.

> **A ordem importa mais do que parece.** Duas animações do projeto tinham a mesma
> condição escrita duas vezes; a segunda nunca era alcançada, e um arquivo de
> áudio jamais tocou. O verificador agora reclama quando uma regra torna outra
> inalcançável.

Todo dado que aparece num `when` **precisa estar em `attributes`** — senão ele
nunca seria buscado, valeria zero, e a regra decidiria sempre errado. O sistema
recusa o envio nesse caso.

---

# Os dois juntos

Se você tem a animação **e** o patch que a sonoriza, mande os dois no **mesmo
pull request**. A ligação é declarada de um lado só, no `patch.json`:

```json
"activation": {
  "moments": ["player"],
  "compositions": ["chuvaDeVerao"]
}
```

Use ali o `id` da animação — o `camelCase`, não o nome da pasta.

E no `composition.json` da animação, diga que o som vem de fora:

```json
"audio": { "kind": "patch" }
```

Pronto. O robô entende que os dois são uma obra só e manda **um link**, que abre a
animação já com o patch tocando.

---

# A jornada, do envio ao ar

O caminho é o mesmo para patch, para animação, ou para os dois.

### 1. Abra a pasta certa

- Patches:
  [github.com/GaiaSenses/Gaiasenses-web/tree/main/patches](https://github.com/GaiaSenses/Gaiasenses-web/tree/main/patches)
- Animações:
  [github.com/GaiaSenses/Gaiasenses-web/tree/main/compositions](https://github.com/GaiaSenses/Gaiasenses-web/tree/main/compositions)

### 2. Clique em "Add file", depois "Upload files"

O botão fica no canto superior direito da lista de arquivos. Se ele não aparecer,
o convite ainda não foi aceito.

### 3. Arraste a pasta inteira da sua obra

Solte na área de upload. O GitHub preserva a estrutura, então `Libs/` continua no
lugar certo. Não descompacte nem reorganize nada antes.

Se a animação usa arquivos de áudio, suba-os também, dentro de `public/audios/`.

### 4. Crie uma _branch_ e abra o _pull request_

Ao final da página de upload, escolha **"Create a new branch for this commit and
start a pull request"**. Dê um nome à branch, algo como `obra-chuva-de-verao`, e
clique em **Propose changes** e depois **Create pull request**.

> **Traduzindo o jargão.** Uma _branch_ é uma cópia paralela do projeto onde a sua
> obra vive até ser aprovada. Um _pull request_ é o pedido para incorporá-la. Nada
> do que você fizer ali afeta o site no ar até alguém aprovar.

### 5. Espere alguns minutos

O robô assume a partir daqui:

| Ele faz | Você vê |
|---|---|
| Confere a ficha da obra | ✅ ou um erro explicado em português |
| Compila o patch, se houver | Um comentário com tamanho e memória |
| Registra a animação, se houver | Um commit do robô na sua branch |
| Espera a Vercel publicar | — |
| Escreve o link | Um comentário com o botão para ver e ouvir |

O commit do robô na sua branch é esperado: são arquivos que o site precisa e que
ninguém escreve à mão.

### 6. Veja e ouça

Clique no link. **São dois cliques até o som**: primeiro **Iniciar**, depois o
botão com o nome da obra. Não é burocracia — o navegador só libera áudio depois de
um gesto seu, e um link que já caísse dentro da animação mostraria a imagem e
ficaria mudo.

Se a obra tem som de arquivo, procure ainda o **Unmute** no canto: o som começa
desligado.

### 7. Ajuste quantas vezes quiser

Não gostou? Volte à pasta, suba o arquivo corrigido **na mesma branch**, e o robô
refaz tudo sozinho. Não abra um pull request novo.

Deu erro? O robô diz o que aconteceu, em português, e o que costuma resolver.

### 8. Avise que está pronto

Escreva um comentário no pull request dizendo que a obra está do jeito que você
quer. Alguém da equipe revisa e publica.

> **Um último passo é da equipe.** Ver a obra pelo link do pull request funciona
> assim que o robô termina. Mas para ela entrar no rodízio automático — aquele em
> que o site escolhe sozinho o que mostrar conforme o clima — alguém precisa
> incluí-la na lista de animações ativas. É uma linha de código, e é decisão
> curatorial, não técnica: peça no pull request quando a obra estiver pronta.

---

# Quando algo não sai como esperado

## Diz que está tocando e não sai som

Quatro causas, em ordem de frequência:

1. **O som começa desligado.** Procure o botão **Unmute** no canto superior
   esquerdo. Enquanto ele disser "Unmute", está mudo.
2. **Faltou o clique.** O navegador só libera áudio depois de um gesto seu. Se
   você chegou por um link, clique em **Iniciar** e depois no nome da obra.
3. **O navegador bloqueou o áudio.** Se ele pedir permissão, aceite.
4. **A obra depende de um dado que agora vale zero.** Um patch de trovão só soa
   quando cai raio de verdade. Num dia calmo ele fica em silêncio — e está certo.

### Como testar quando o dado está zerado

Com a obra tocando, abra o console do navegador — tecla **F12**, aba **Console** —
e mande o valor você mesmo:

```js
Pd4Web.sendBang("bolt")
Pd4Web.sendFloat("gaia.temp", 38)
Pd4Web.sendFloat("gaia.rain", 12)
```

É a maneira mais rápida de separar "está funcionando, só não tem dado" de "está
quebrado".

Para uma animação, o equivalente é abrir o link do preview trocando o lugar:
`?lat=-3.1&lng=-60.0` põe o globo em Manaus, onde chove muito mais.

## A animação abre em preto

Quase sempre é o `play`: se o sketch chama `p5.noLoop()` e nunca volta a chamar
`p5.loop()` quando `play` fica verdadeiro, ele desenha um quadro e para. Confira o
`updateWithProps` do exemplo.

## O robô reclamou de um nome

Ele sugere a grafia certa. Os nomes de dados são exatos, incluindo maiúsculas:
`windSpeed`, `lightningCount`, `closeFires`.

---

# Perguntas que sempre aparecem

**Quero um dado que não está na lista.**
Peça no pull request, dizendo qual dado e para quê. Acrescentar um dado novo é
trabalho de programação e leva alguns dias — mas depois de pronto fica disponível
para todo mundo, para sempre.

**Meu patch usa uma biblioteca externa (else, cyclone…).**
Pode funcionar, pode não funcionar. O robô avisa se o objeto não existir no
compilador. Se for essencial para a peça, comente pedindo — dá para incluir a
biblioteca, mas isso aumenta o tamanho do site para todos os visitantes, então é
uma decisão da equipe.

**Minha obra não usa dado nenhum. Tem problema?**
Nenhum. O sistema avisa que ela não escuta nada, mas é só um aviso. Muitas obras
são assim.

**Posso ver ou ouvir antes de enviar?**
Um patch, sim, no Pd mesmo: os objetos `[r gaia.*]` simplesmente não recebem nada
quando você toca localmente — ligue um `[number]` neles para testar valores à mão.
Uma animação, no editor do p5 ou no OpenProcessing, trocando os dados do clima por
sliders enquanto compõe.

**Minha animação usa uma biblioteca de p5 (p5.sound, addons…).**
Pergunte antes de contar com ela. O projeto carrega o p5 base; cada adição pesa
para todo visitante.

**Enviei e não aconteceu nada.**
Confira se você criou mesmo o pull request, e não apenas subiu os arquivos. Se
criou e o robô não respondeu em quinze minutos, escreva um comentário marcando
alguém da equipe.

**Posso usar áudio de terceiros?**
Só com licença compatível. O formulário de envio pede essa confirmação, e ela é
levada a sério: o GaiaSenses é público.

---

# Para a equipe de desenvolvimento

A arquitetura está no [README do projeto](../../README.md). O fluxo automático são
quatro workflows, e o cabeçalho de cada um explica por que ele existe:

| Workflow | Faz |
|---|---|
| `patch-build.yml` | valida, compila e commita os artefatos do patch |
| `registrar-animacao.yml` | regenera o registro de animações e commita |
| `patch-preview.yml` | posta os links quando a Vercel termina de publicar |
| `verificar-app.yml` | tipos, lint, testes e build em todo pull request |

```bash
npm run patches:validate       # valida manifestos e cruza os receivers com os .pd
npm run patches:build          # compila (precisa do pd4web, veja abaixo)
npm run patches:codegen        # regenera o registro, o vocabulario.md e o formulário
npm run patches:check          # falha se algum gerado estiver desatualizado
npm run patches:gc             # remove runtimes wasm que nenhum patch referencia

npm run compositions:validate  # valida os manifestos das animações
npm run compositions:codegen   # regenera compositions-declared.generated.ts
```

Para compilar patches localmente é preciso o `pd4web`. Em Linux x86-64 com
glibc ≥ 2.38:

```bash
python3 -m venv .pd4web-venv
.pd4web-venv/bin/pip install "pd4web==3.3.0.post1"
```

A primeira compilação baixa o emscripten (~2,3 GB) e leva uns 6 minutos; as
seguintes, cerca de 1 minuto e meio.

### Auditar sem esperar o CI

```
http://localhost:3000/pt/map3?patch=<id>
http://localhost:3000/pt/map3?lat=-23.55&lng=-46.63&composition=<id>
```

O `?patch=` sobrepõe a escolha automática e, quando o patch declara uma
composição, encaminha para o player dela. O `?composition=` funciona mesmo para
animações que ainda não entraram no rodízio.

As coordenadas vão explícitas de propósito: a `middleware` só preenche `lat`/`lng`
quando o next-intl redireciona, e uma URL que já traz o idioma não redireciona.

Note que os patches de composição aparecem no dropdown pelo nome da **animação**,
não pelo nome do patch: `lluvia` toca `bubble1`, `lightningBolts` toca `thunder4`.

### Publicar uma animação no rodízio

Registrar a animação a torna acessível por link. Para entrar na escolha automática
por clima, acrescente o `id` a `ENABLED_COMPOSITIONS`, em
`app/[locale]/map3/map-constants.ts`. A separação é proposital: o link de preview
funciona no pull request sem que a obra já esteja no ar para o público.

### Verificação de áudio sem depender de ouvido

```js
const ctx = window.Pd4WebAudioContext;
const analyser = ctx.createAnalyser();
window.Pd4WebAudioWorkletNode.connect(analyser);
const buf = new Float32Array(analyser.fftSize);
analyser.getFloatTimeDomainData(buf);
// RMS > 0 prova que o patch está gerando sinal.
```

Isso mede a saída do patch **antes** do controle de volume, então um RMS positivo
com silêncio nas caixas significa que o mute está ligado, não que o patch falhou.

**Espere o worklet existir antes de medir.** `window.Pd4WebAudioWorkletNode` só
aparece alguns segundos depois do play, e medir antes disso devolve silêncio por
um motivo que não tem nada a ver com a peça — o que já produziu mais de um
diagnóstico falso de regressão.
