<!-- GERADO por scripts/gen-musician-docs.mjs — não edite à mão. -->
# Vocabulário GaiaSenses

Esta é a lista completa de dados que o seu patch pode receber e enviar.

**Como usar:** coloque no seu patch um objeto `[r nome-do-canal]`. Só isso. Não é
preciso avisar ninguém nem editar nenhum arquivo de configuração — quando você
enviar o patch, o sistema lê os objetos que você usou e liga tudo sozinho.

Se você escrever um nome que não existe nesta lista, o objeto simplesmente nunca
recebe nada. Confira a grafia com atenção, inclusive maiúsculas e minúsculas.

---

## Dados que o seu patch pode receber

### Do globo

| Coloque no patch | O que chega | Faixa de valores | Nomes antigos aceitos |
|---|---|---|---|
| `[r gaia.lat]` | Latitude do centro do mapa | -90 a 90 ° | `latitude`, `lati` |
| `[r gaia.lon]` | Longitude do centro do mapa | -180 a 180 ° | `longitude`, `rotacaoSite` |
| `[r gaia.speed]` | Velocidade de rotação do globo | 0 a 180 °/s | — |

- `gaia.lat` — Onde o globo está apontando agora. Sul é negativo, norte é positivo.
- `gaia.lon` — Oeste é negativo, leste é positivo.
- `gaia.speed` — Quão rápido o público está girando o globo. Zero quando parado.

### Do clima do lugar para onde o globo aponta

| Coloque no patch | O que chega | Faixa de valores | Nomes antigos aceitos |
|---|---|---|---|
| `[r gaia.temp]` | Temperatura do ar | -60 a 55 °C | — |
| `[r gaia.humidity]` | Umidade relativa do ar | 0 a 100 % | — |
| `[r gaia.clouds]` | Cobertura de nuvens | 0 a 100 % | — |
| `[r gaia.rain]` | Chuva na última hora | 0 a 100 mm/h | — |
| `[r gaia.wind.speed]` | Velocidade do vento | 0 a 60 m/s | — |
| `[r gaia.wind.deg]` | Direção do vento | 0 a 360 ° | — |
| `[r gaia.lightning]` | Raios detectados por perto | 0 a 500 contagem | — |
| `[r gaia.fire]` | Focos de queimada por perto | 0 a 500 contagem | — |

- `gaia.temp` — Do local para onde o globo está apontando.
- `gaia.rain` — Zero na maior parte do tempo. Acima de 10 já é chuva forte.
- `gaia.wind.deg` — 0 é vento vindo do norte, 90 do leste.
- `gaia.lightning` — Contagem do satélite GOES-19 num raio de 100 km.
- `gaia.fire` — Contagem do NASA FIRMS num raio de 100 km.

### Do sensor Bolota (só quando ele está conectado)

| Coloque no patch | O que chega | Faixa de valores | Nomes antigos aceitos |
|---|---|---|---|
| `[r gaia.acc.x]` | Aceleração no eixo X (sensor Bolota) | -16 a 16 g | `aceX` |
| `[r gaia.acc.y]` | Aceleração no eixo Y (sensor Bolota) | -16 a 16 g | `aceY` |
| `[r gaia.acc.z]` | Aceleração no eixo Z (sensor Bolota) | -16 a 16 g | `aceZ` |
| `[r gaia.co2]` | CO₂ medido pelo sensor | 400 a 5000 ppm | `co2` |
| `[r gaia.sensors]` | Pacote completo do sensor |  | `input` |

- `gaia.acc.x` — Só chega quando o sensor BLE está conectado.
- `gaia.acc.y` — Só chega quando o sensor BLE está conectado.
- `gaia.acc.z` — Só chega quando o sensor BLE está conectado.
- `gaia.co2` — Ar livre fica perto de 420 ppm. Sala fechada com gente passa de 1000 ppm.
- `gaia.sensors` — Lista de 7 valores: giroX giroY giroZ aceX aceY aceZ co2. Use [list split] para separar.

---

## O seu patch também pode falar com o site

### `[s gaia.out]` — O patch move o globo

Envie uma lista de 2 valores — latitude e longitude — e o globo vai para lá.

---

## Eventos das animações

Quando o seu patch toca junto com uma animação, ele pode escutar o que a animação
está fazendo. Estes nomes pertencem à animação e valem para qualquer patch que
toque com ela.

### lightningBolts
- `[r bolt]` — Um raio foi desenhado. Chega uma vez por raio. Numa tempestade forte podem ser dezenas por segundo.

### lluvia
- `[r start]` — A animação começou. Chega uma única vez, quando a chuva aparece na tela.
- `[s paint]` — Desenhar uma gota. Mande um bang para [s paint] e uma gota nova aparece na tela. É o patch controlando o visual.

### curves

Compartilha o patch do mapa (keepMapPatch) e alimenta gaia.lat/gaia.lon a cada quadro com valores gerados, não com a posição real.

### cloudBubble

Compartilha o patch do mapa (keepMapPatch) e alimenta gaia.lat/gaia.lon e gaia.acc.* a cada 2 s com valores gerados.

---

## Quer um dado que não está aqui?

Abra uma issue no repositório dizendo qual dado e para quê. Acrescentar um canal
novo é trabalho de programação e leva alguns dias — mas depois de pronto ele fica
disponível para todo mundo, para sempre.
