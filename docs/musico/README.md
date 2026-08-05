# Como colocar o seu patch de Pure Data no ar

Você monta o patch no Pd, envia pelo site do GitHub, e em alguns minutos recebe um
link para ouvir a sua peça tocando dentro do GaiaSenses, com dados reais de clima.

**Sem instalar nada além do Pure Data e sem depender de um programador.**

---

## Antes de tudo: o que você precisa ter

### Pure Data no seu computador

O Pd vanilla, de [puredata.info](https://puredata.info). É onde você compõe, como já
faz hoje.

### Uma conta no GitHub

O GitHub é onde o projeto guarda tudo. Você vai usá-lo só pelo navegador — nada de
linha de comando. Se ainda não tem conta:

1. Acesse [github.com/signup](https://github.com/signup).
2. Informe e-mail, senha e um nome de usuário.
3. Confirme o e-mail que eles enviam.

É gratuito e leva uns três minutos.

### Um convite para o projeto

Ter conta não basta: alguém da equipe precisa te dar acesso ao repositório. Depois de
criar a conta, mande o seu nome de usuário para a equipe. Pode copiar esta mensagem:

> Oi! Criei minha conta no GitHub, meu usuário é **@seu-usuario**. Pode me adicionar
> como colaborador no repositório Gaiasenses-web? Quero enviar um patch.

Você vai receber um e-mail de convite. **Aceite antes de continuar** — sem isso o botão
de enviar arquivos não aparece.

### Um navegador atualizado

Chrome, Edge ou Firefox recentes. Para ouvir, prefira fone de ouvido; no celular, tire
do modo silencioso.

---

## Como organizar a pasta do patch

O compilador exige uma organização específica. Não é capricho: é o que ele entende.

```
minha-peca/
├── main.pd          o patch principal, com esse nome exato
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
> Se o arquivo se chama `MinhaAbs.pd` e você escreve `[minhaabs]`, funciona no seu Mac
> e quebra no servidor. O sistema avisa quando isso acontece, mas é melhor já nascer
> certo.

> **Limitação conhecida.** O compilador aceita **apenas um _graph_** no patch principal
> — aquelas caixas com "graph on parent" ligado. Se você usa várias, mova-as para dentro
> de abstrações em `Libs/`.

---

## Escolha os dados que a sua peça vai escutar

Aqui está o coração do sistema. Para receber um dado do mundo, você coloca no patch um
objeto de _receive_ com o nome do dado:

```
[r gaia.temp]     <- a temperatura do lugar para onde o globo está apontando
```

**É só isso.** Não existe arquivo de configuração para preencher, nem ninguém para
avisar. Quando você enviar o patch, o sistema lê os objetos que você usou e liga tudo
sozinho.

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

Os canais do sensor só chegam quando o Bolota está conectado. Os de clima mudam quando
o público move o globo para outro lugar — não são contínuos.

### O seu patch também pode falar de volta

Mande uma lista de dois valores — latitude e longitude — para `[s gaia.out]` e o globo
vai para lá. É o patch dirigindo o visual.

### Se a sua peça toca junto com uma animação

Algumas animações avisam o que estão fazendo. Esses nomes pertencem à animação e valem
para qualquer patch que toque com ela.

| Animação | Coloque no patch | Quando chega |
|---|---|---|
| `lightningBolts` | `[r bolt]` | um _bang_ a cada raio desenhado |
| `lluvia` | `[r start]` | uma vez, quando a chuva aparece |
| `lluvia` | `[s paint]` | mande um _bang_ e nasce uma gota na tela |

A lista completa e sempre atualizada está em [vocabulario.md](vocabulario.md).

---

## Um exemplo que funciona

O patch mais simples possível usando dados reais. A temperatura vira a altura de uma
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

### Três cuidados que valem a peça

- **Sempre limite a faixa de entrada** com `[clip]`. Um sensor com defeito ou uma API
  fora do ar pode mandar um número estranho, e você não quer que isso vire um estouro no
  alto-falante.
- **Os dados chegam devagar.** O clima só muda quando o público move o globo. Se você
  quer movimento contínuo, use o dado como _destino_ e interpole no Pd — com `[line]`,
  por exemplo.
- **Comece em volume baixo.** A peça pode tocar numa exposição, com o volume do sistema
  alto.

---

## A jornada, do envio ao som

### 1. Abra a pasta de patches

Vá em
[github.com/GaiaSenses/Gaiasenses-web/tree/main/patches](https://github.com/GaiaSenses/Gaiasenses-web/tree/main/patches).
Você vai ver as peças que já existem, cada uma na sua pasta.

### 2. Clique em "Add file", depois "Upload files"

O botão fica no canto superior direito da lista de arquivos. Se ele não aparecer, o
convite ainda não foi aceito.

### 3. Arraste a pasta inteira da sua peça

Solte na área de upload. O GitHub preserva a estrutura, então `Libs/` continua no lugar
certo. Não descompacte nem reorganize nada antes.

### 4. Escreva o `patch.json`

Ainda na mesma tela, clique em **"Add file → Create new file"**, dê o nome
`minha-peca/patch.json` e cole isto, trocando os valores:

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
- `moments`: use `"player"` se a peça toca junto com uma animação, ou `"map"` se ela é a
  paisagem sonora do globo.
- `compositions`: com qual animação ela toca. Remova a linha se for som do globo.
- `initialMemory`: 64 MB serve para quase tudo. Suba para 128 ou 256 se a peça tem
  muitas vozes ou samples grandes.

### 5. Crie uma _branch_ e abra o _pull request_

Ao final da página de upload, escolha **"Create a new branch for this commit and start a
pull request"**. Dê um nome à branch, algo como `patch-minha-peca`, e clique em
**Propose changes** e depois **Create pull request**.

> **Traduzindo o jargão.** Uma _branch_ é uma cópia paralela do projeto onde a sua peça
> vive até ser aprovada. Um _pull request_ é o pedido para incorporá-la. Nada do que
> você fizer ali afeta o site no ar até alguém aprovar.

### 6. Espere alguns minutos

O robô compila a sua peça e escreve dois comentários no pull request: um dizendo o que
compilou, outro com o link para ouvir.

### 7. Ouça

Clique no link. Na tela, aperte **Iniciar** e depois **Unmute** — o som começa desligado,
e o navegador só o libera depois de um clique seu.

### 8. Ajuste quantas vezes quiser

Não gostou? Volte à pasta, suba o arquivo corrigido **na mesma branch**, e o robô
recompila sozinho. Não abra um pull request novo.

Deu erro de compilação? O robô diz o que aconteceu, em português, e o que costuma
resolver.

### 9. Avise que está pronto

Escreva um comentário no pull request dizendo que a peça está do jeito que você quer.
Alguém da equipe revisa e publica.

---

## Diz que está tocando e não sai som

Três causas, em ordem de frequência:

1. **O som começa desligado.** Procure o botão **Unmute** no canto superior esquerdo.
   Enquanto ele disser "Unmute", está mudo.
2. **O navegador bloqueou o áudio.** Se ele pedir permissão, aceite.
3. **A sua peça depende de um dado que agora vale zero.** Um patch de trovão só soa
   quando cai raio de verdade. Num dia calmo ele fica em silêncio — e está certo.

### Como testar quando o dado está zerado

Com a peça tocando, abra o console do navegador — tecla **F12**, aba **Console** — e
mande o valor você mesmo:

```js
Pd4Web.sendBang("bolt")
Pd4Web.sendFloat("gaia.temp", 38)
Pd4Web.sendFloat("gaia.rain", 12)
```

É a maneira mais rápida de separar "está funcionando, só não tem dado" de "está
quebrado".

---

## Perguntas que sempre aparecem

**Quero um dado que não está na lista.**
Peça no pull request, dizendo qual dado e para quê. Acrescentar um canal novo é trabalho
de programação e leva alguns dias — mas depois de pronto fica disponível para todo
mundo, para sempre.

**Meu patch usa uma biblioteca externa (else, cyclone…).**
Pode funcionar, pode não funcionar. O robô avisa se o objeto não existir no compilador.
Se for essencial para a peça, comente pedindo — dá para incluir a biblioteca, mas isso
aumenta o tamanho do site para todos os visitantes, então é uma decisão da equipe.

**Minha peça toca sozinha, sem receber dado nenhum. Tem problema?**
Nenhum. O sistema avisa que ela não escuta nada, mas é só um aviso. Muitas peças são
assim.

**Posso ouvir antes de enviar?**
Sim, no Pd mesmo. Os objetos `[r gaia.*]` simplesmente não recebem nada quando você toca
localmente — ligue um `[number]` neles para testar valores à mão enquanto compõe.

**Enviei e não aconteceu nada.**
Confira se você criou mesmo o pull request, e não apenas subiu os arquivos. Se criou e o
robô não respondeu em quinze minutos, escreva um comentário marcando alguém da equipe.

---

## Para a equipe de desenvolvimento

O fluxo automático está descrito em `my-docs/gaiasenses-fluxo-patches-pd.md`. Comandos
úteis:

```bash
npm run patches:validate   # valida manifestos e cruza os receivers com os .pd
npm run patches:build      # compila (precisa do pd4web, veja abaixo)
npm run patches:codegen    # regenera o registro, o vocabulario.md e o formulário
npm run patches:check      # falha se algum gerado estiver desatualizado
npm run patches:gc         # remove runtimes wasm que nenhum patch referencia
```

Para compilar localmente é preciso o `pd4web`. Em Linux x86-64 com glibc ≥ 2.38:

```bash
python3 -m venv .pd4web-venv
.pd4web-venv/bin/pip install "pd4web==3.3.0.post1"
```

A primeira compilação baixa o emscripten (~2,3 GB) e leva uns 6 minutos; as seguintes,
cerca de 1 minuto e meio.

Para auditar um patch específico no navegador, sem esperar o CI:
`http://localhost:3000/pt/map3?patch=<id>` — o parâmetro sobrepõe a escolha automática e,
quando o patch declara uma composição, encaminha para o player dela.

Note que os patches de composição aparecem no dropdown pelo nome da **animação**, não
pelo nome do patch: `lluvia` toca `bubble1`, `lightningBolts` toca `thunder4`.

Verificação de áudio sem depender de ouvido, útil em teste automatizado:

```js
const ctx = window.Pd4WebAudioContext;
const analyser = ctx.createAnalyser();
window.Pd4WebAudioWorkletNode.connect(analyser);
const buf = new Float32Array(analyser.fftSize);
analyser.getFloatTimeDomainData(buf);
// RMS > 0 prova que o patch está gerando sinal.
```

Isso mede a saída do patch **antes** do controle de volume, então um RMS positivo com
silêncio nas caixas significa que o mute está ligado, não que o patch falhou.
