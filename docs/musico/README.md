# Como publicar um patch de Pure Data no GaiaSenses

Este guia é para quem compõe. Você não precisa saber programar, não precisa
instalar nada além do Pure Data, e não precisa pedir nada a um desenvolvedor.

O caminho é: **você monta o patch no Pd → envia pelo site do GitHub → em alguns
minutos recebe um link para ouvir a sua peça rodando dentro do GaiaSenses.**

---

## Antes de começar

Você vai precisar de:

- **Pure Data** instalado no seu computador (o Pd vanilla, de puredata.info).
- Uma **conta no GitHub**. É grátis: [github.com/signup](https://github.com/signup).
  Depois de criar, avise a equipe para te dar acesso ao projeto.

Nada mais. Você não vai usar linha de comando nem instalar compilador nenhum.

---

## 1. Monte a pasta do seu patch

O GaiaSenses exige uma organização específica. Não é capricho: é o que o
compilador entende.

```
minha-peca/
├── main.pd          <- o patch principal, com esse nome exato
├── Libs/            <- todas as suas abstrações (.pd) vão aqui dentro
│   ├── minhaAbs.pd
│   └── outraAbs.pd
├── Audios/          <- arquivos .wav ou .aif, se a peça usar (opcional)
└── Extras/          <- imagens e outros arquivos (opcional)
```

Três regras que causam quase todos os erros:

1. **O patch principal precisa se chamar `main.pd`** e ficar na raiz da pasta.
2. **Todas as abstrações vão dentro de `Libs/`.** Nenhuma solta na raiz.
3. **Coloque o objeto `declare -path Libs` dentro do `main.pd`.** Sem ele o Pd
   não encontra as suas abstrações. Basta um, em qualquer lugar do patch.

E uma armadilha silenciosa: **maiúsculas e minúsculas importam.** Se o arquivo se
chama `MinhaAbs.pd` e você escreve `[minhaabs]`, funciona no seu Mac e quebra no
servidor. O sistema vai te avisar quando isso acontecer, mas é bom já nascer certo.

### Limitação conhecida

O compilador aceita **apenas um *graph* no patch principal** (aquelas caixas com
"graph on parent" ligado). Se você usa várias, mova-as para dentro de abstrações
em `Libs/`.

---

## 2. Escolha os dados que a sua peça vai escutar

Aqui está o coração do sistema. Para receber um dado do mundo, você coloca no
patch um objeto de receive com o nome do dado:

```
[r gaia.temp]      <- a temperatura do lugar para onde o globo está apontando
[r gaia.rain]      <- quanta chuva caiu na última hora
[r gaia.wind.speed]
[r gaia.lightning] <- quantos raios foram detectados por perto
```

**É só isso.** Não existe arquivo de configuração para preencher, nem ninguém para
avisar. Quando você enviar o patch, o sistema lê os objetos que você usou e liga
tudo sozinho.

A lista completa está em **[vocabulario.md](vocabulario.md)** — vale abrir agora e
dar uma olhada no que existe.

### Um exemplo que funciona

Este é o patch mais simples possível que usa dados reais. A temperatura vira a
altura de uma nota: quanto mais quente o lugar, mais aguda.

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
[*~ 0.05]            <- volume baixo; cuide dos ouvidos de quem escuta
|
[dac~]
```

Você encontra ele pronto em [`patches/exemplo-clima/`](../../patches/exemplo-clima/).
Copie e mexa à vontade.

### Cuidados que valem a peça

- **Sempre limite a faixa de entrada** com `[clip]`. Um sensor com defeito ou uma
  API fora do ar pode mandar um número estranho, e você não quer que isso vire um
  estouro no alto-falante.
- **Os dados chegam devagar.** O clima só muda quando o público move o globo para
  outro lugar. Se você quer movimento contínuo, use os dados como *destino* e
  interpole no Pd — com `[line]` ou `[glide]`, por exemplo.
- **Comece em volume baixo.** A peça pode tocar numa exposição, com o volume do
  sistema alto.

---

## 3. Enviar

1. Abra a pasta `patches/` no GitHub:
   [github.com/GaiaSenses/Gaiasenses-web/tree/main/patches](https://github.com/GaiaSenses/Gaiasenses-web/tree/main/patches)
2. Clique em **Add file → Upload files**.
3. **Arraste a pasta inteira** da sua peça para a área de upload. O GitHub
   preserva a estrutura, então `Libs/` continua no lugar certo.
4. Role até o fim e escolha **"Create a new branch for this commit and start a
   pull request"**. Dê um nome à branch, algo como `patch-minha-peca`.
5. Clique em **Propose changes** e depois em **Create pull request**.

Falta um arquivo: o `patch.json`, com o nome e a autoria da peça. Se você não
criar, o robô abre um comentário pedindo — ou você pode criar junto, copiando
este modelo e trocando os valores:

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
  "activation": { "moments": ["player"], "compositions": ["lightningBolts"] }
}
```

- **`id`** precisa ser igual ao nome da pasta. Use letras minúsculas e hífen.
- **`activation.moments`**: use `"player"` se a peça toca junto com uma animação,
  ou `"map"` se ela é a paisagem sonora do globo.
- **`activation.compositions`**: com qual animação a peça toca. Os nomes válidos
  estão listados em [vocabulario.md](vocabulario.md), na seção de eventos.
- **`build.initialMemory`**: 64 MB serve para quase tudo. Se a peça tem muitas
  vozes ou samples grandes, suba para 128 ou 256.

---

## 4. Ouvir

Alguns minutos depois, o robô comenta no seu pull request. Duas coisas podem
acontecer:

**Compilou.** Você recebe um link. Abra, clique em **Iniciar** e ouça. O navegador
só libera som depois de um clique seu — se você abrir e não ouvir nada, é isso.

Use fone de ouvido. No celular, tire do modo silencioso.

**Não compilou.** O robô diz o que deu errado, em português, e o que costuma
resolver. Corrija o arquivo, suba de novo **na mesma branch**, e o robô recompila
sozinho. Pode repetir quantas vezes quiser — é para isso que serve.

### Abriu, diz que está tocando, e não sai som

Três causas, em ordem de frequência:

1. **O som começa desligado.** Procure o botão **Unmute** no canto superior
   esquerdo, ao lado do texto de status. Enquanto ele disser "Unmute", está mudo.
2. **O navegador bloqueou o áudio.** Se ele pedir permissão, aceite. O Pd precisa
   iniciar o sistema de áudio, e um bloqueio impede isso.
3. **A sua peça depende de um dado que agora vale zero.** Um patch de trovão só
   soa quando cai raio de verdade. Num dia calmo ele fica em silêncio — e está
   certo. Veja abaixo como testar mesmo assim.

### Como testar quando o dado está zerado

Abra o console do navegador (F12 → Console) com a peça tocando e mande o valor
você mesmo:

```js
Pd4Web.sendBang("bolt")           // dispara um evento
Pd4Web.sendFloat("gaia.temp", 38) // finge 38 °C
Pd4Web.sendFloat("gaia.rain", 12) // finge chuva forte
```

`Pd4Web` é a peça que está tocando naquele momento. Isso é a maneira mais rápida
de separar "está funcionando, só não tem dado" de "está quebrado".

Para trocar um arquivo: vá até ele no GitHub, clique no lápis (ou em **Upload
files** para substituir vários de uma vez), e confirme. Não abra um pull request
novo.

---

## 5. Publicar

Quando estiver do jeito que você quer, escreva um comentário no pull request
dizendo que está pronto. Alguém da equipe revisa e publica.

---

## Perguntas frequentes

**Quero um dado que não está na lista.**
Abra uma issue dizendo qual dado e para quê. Acrescentar um canal novo é trabalho
de programação e leva alguns dias — mas depois de pronto fica disponível para
todo mundo, para sempre.

**Meu patch usa um objeto de biblioteca externa (else, cyclone…).**
Pode ser que funcione, pode ser que não. O robô avisa se o objeto não existir no
compilador. Se for essencial para a peça, comente no pull request pedindo — dá
para incluir a biblioteca, mas isso aumenta o tamanho do site para todos os
visitantes, então é uma decisão da equipe.

**Meu patch toca sozinho, sem receber dado nenhum. Tem problema?**
Nenhum. O sistema avisa que ele não escuta nada, mas é só um aviso. Muitas peças
são assim.

**Posso ouvir antes de enviar?**
Sim, no Pd mesmo. Os objetos `[r gaia.*]` simplesmente não recebem nada quando
você toca localmente — coloque um `[number]` ligado a eles para testar valores à
mão enquanto compõe.

**Enviei e não aconteceu nada.**
Confira se você criou mesmo o pull request (e não só o commit). Se criou e o robô
não respondeu em 15 minutos, marque alguém da equipe no comentário.

---

## Para a equipe de desenvolvimento

O fluxo automático está descrito em
[`my-docs/gaiasenses-fluxo-patches-pd.md`](../../../my-docs/gaiasenses-fluxo-patches-pd.md).
Comandos úteis:

```bash
npm run patches:validate   # valida manifestos e cruza os receivers com os .pd
npm run patches:build      # compila (precisa do pd4web; veja abaixo)
npm run patches:codegen    # regenera o registro e o vocabulario.md
npm run patches:check      # falha se o gerado estiver desatualizado
```

Para compilar localmente é preciso o `pd4web`. Em Linux x86-64 com glibc ≥ 2.38:

```bash
python3 -m venv .pd4web-venv
.pd4web-venv/bin/pip install "pd4web==3.3.0.post1"
```

A primeira compilação baixa o emscripten (~2,3 GB) e leva uns 6 minutos; as
seguintes levam cerca de 1 minuto e meio.

Para auditar um patch específico no navegador, sem esperar o CI:
`http://localhost:3000/pt/map3?patch=<id>` — o parâmetro sobrepõe a escolha
automática e vale para qualquer patch, inclusive os de composição.

Note que os patches de composição aparecem no dropdown pelo nome da **animação**,
não pelo nome do patch: `lluvia` toca `bubble1`, `lightningBolts` toca `thunder4`.

Verificação de áudio sem depender de ouvido, útil em teste automatizado:

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
