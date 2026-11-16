# 🌦️ Guia rápido da API pública do GaiaSenses

**Para quem não programa** e quer consultar, em tempo quase real, o clima, os
raios, as queimadas e a chuva por satélite de qualquer ponto do mapa.

Não precisa de cadastro, senha ou pagamento. Basta um navegador.

---

## Como usar, em 3 passos

### 1. Descubra a latitude e a longitude do lugar

No **Google Maps**, clique com o **botão direito** sobre o lugar desejado: o
primeiro item do menu são as coordenadas (ex.: `-23.55, -46.63`). Clique nelas
para copiar. O primeiro número é a **latitude** (`lat`), o segundo é a
**longitude** (`lon`).

### 2. Monte o endereço

Troque os números pelos seus no endereço abaixo:

```
https://gaiasenses-web.vercel.app/api/v1/now?lat=-23.55&lon=-46.63
```

### 3. Abra no navegador

Cole o endereço na barra do navegador e aperte Enter. A resposta aparece na
hora, em formato **JSON** (texto organizado em pares "nome": valor). O Firefox
já mostra o JSON formatado e navegável; no Chrome, tudo vem numa linha só —
funciona igual, só é menos bonito.

**Experimente agora** (clique ou copie):

| Lugar | Link |
|---|---|
| São Paulo | <https://gaiasenses-web.vercel.app/api/v1/now?lat=-23.55&lon=-46.63> |
| Manaus | <https://gaiasenses-web.vercel.app/api/v1/now?lat=-3.10&lon=-60.02> |
| Campinas (Unicamp) | <https://gaiasenses-web.vercel.app/api/v1/now?lat=-22.82&lon=-47.07> |

---

## Entendendo a resposta

Uma resposta típica (resumida):

```json
{
  "location":  { "lat": -23.55, "lon": -46.63, "city": "São Paulo", "radiusKm": 100 },
  "weather":   { "temperature": 22.5, "humidity": 87, "wind": { "speed": 2.5 } },
  "lightning": { "count": 0, "events": [] },
  "fire":      { "count": 7, "events": [ { "lat": -23.59, "lon": -47.43 } ] },
  "rainSatellite": { "rateMmH": 0 },
  "sources":   { "weather": "ok", "lightning": "ok", "fire": "ok" }
}
```

O que cada bloco significa:

| Bloco | O que é | De onde vem |
|---|---|---|
| `location` | O ponto consultado e o nome do lugar. Raios e queimadas cobrem um círculo de **100 km** em volta dele | OpenWeather (nome do lugar) |
| `weather` | O clima de agora: temperatura, umidade, vento, nuvens, chuva… | Open-Meteo |
| `lightning` | Quantos **raios** caíram há pouco na região (`count`) e onde (`events`) | Satélite GOES-19 (NOAA) |
| `fire` | Quantos **focos de queimada** ativos (`count`) e onde (`events`) | NASA FIRMS |
| `rainSatellite` | Intensidade de **chuva estimada por satélite**, em mm/h | Satélite GOES-19 (NOAA) |
| `sources` | O "painel de saúde": diz se cada fonte acima respondeu (`ok`) ou não | — |

### As unidades dos números

| Dado | Unidade | Atenção |
|---|---|---|
| `temperature`, `apparentTemperature` | °C | `apparentTemperature` é a sensação térmica |
| `humidity`, `cloudCover` | % | |
| `wind.speed`, `wind.gust` | **m/s** | para km/h, multiplique por 3,6 |
| `wind.direction` | graus (0 = vento vindo do norte) | |
| `precipitation`, `rain`, `showers` | mm | |
| `snowfall` | **cm** | |
| `rainSatellite.rateMmH` | mm/h | |
| `observedAt`, `fetchedAt` | data/hora em **UTC** | Brasil = UTC − 3 h |

---

## Quando um bloco vem "null" (vazio)

A API tem uma regra de honestidade: **ela nunca inventa um número**.

- `"lightning": null` + `"sources": { "lightning": "unavailable" }` significa
  **"a fonte de raios não respondeu agora"** — não significa que não há raios.
  Tente de novo mais tarde.
- `"lightning": { "count": 0 }` com `"sources": { "lightning": "ok" }`
  significa **céu calmo de verdade**: consultamos e não havia raios.

Essa diferença entre *"não sabemos"* (null) e *"não há"* (zero) vale para
todos os blocos. O nome do lugar (`city`) também pode vir `null` em áreas sem
cidade por perto — no meio do oceano, por exemplo — e isso é normal.

---

## Combinados de uso

- **Limite:** até **30 consultas por minuto** por pessoa. Passou disso, a
  resposta vira um erro `429` — espere um minuto e tente de novo.
- **Não precisa consultar toda hora:** o clima se atualiza a cada ~15 minutos
  e os dados de satélite a cada ~2 horas. Consultar mais rápido que isso só
  devolve o mesmo dado.
- As coordenadas são arredondadas para ~1 km — pontos vizinhos recebem a
  mesma resposta, e está tudo bem.
- Uso livre e gratuito. Se publicar algo com esses dados, cite o **GaiaSenses
  (Unicamp)** e as fontes (NOAA/GOES-19, NASA FIRMS, Open-Meteo).

---

## Perguntas frequentes

**Deu erro 400, e agora?**
Confira o endereço: `lat` e `lon` precisam ser números (latitude entre −90 e
90, longitude entre −180 e 180), com **ponto** decimal, não vírgula.

**O vento parece fraco demais.**
Ele vem em **m/s** (metros por segundo). Multiplicar por 3,6 dá o valor em
km/h, a unidade da previsão do tempo na TV. Até a correção da #241, a API
entregava km/h.

**A hora parece errada.**
As horas vêm em UTC (padrão internacional). Para o horário de Brasília,
subtraia 3 horas.

**Posso usar num site, app ou planilha?**
Pode — a API aceita chamadas de qualquer página (CORS aberto). Quem programa
encontra o contrato técnico completo em [`api-publica.md`](api-publica.md).

**Encontrei um problema ou tenho uma sugestão.**
Abra uma *issue* em <https://github.com/GaiaSenses/Gaiasenses-web/issues>.

---

*GaiaSenses — arte e dados ambientais em tempo real · <https://gaiasenses-web.vercel.app>*
