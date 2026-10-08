# API pública — dados meteorológicos instantâneos

`GET https://gaiasenses-web.vercel.app/api/v1/now?lat=<lat>&lon=<lon>`

Uma chamada devolve, em JSON, tudo o que o GaiaSenses sabe sobre o tempo em um
ponto agora: clima (Open-Meteo), raios (GOES-19 GLM), focos de incêndio (NASA
FIRMS), taxa de chuva por satélite (GOES-19 RRQPEF) e o nome do lugar
(geocoding reverso). Anônima, com CORS aberto e rate limit por IP.

`GET /api/v1` devolve uma autodescrição resumida deste contrato.

> Esta rota substitui a antiga `/api/satellite`, removida em ago/2026 (HIG-03)
> por ser um proxy aberto na frente de um backend sem medidor. A seção
> [Por que o desenho é este](#por-que-o-desenho-é-este) explica as proteções —
> leia antes de "simplificar" qualquer uma delas.

## Parâmetros

| Parâmetro | Obrigatório | Faixa |
|---|---|---|
| `lat` | sim | número em [-90, 90] |
| `lon` | sim | número em [-180, 180] |

Não há parâmetro de raio: os eventos de raio e fogo cobrem um **raio fixo de
100 km**, o mesmo que o mapa do site usa.

Entrada inválida responde `400 {"error": "..."}` sem consultar nenhuma fonte.

## Exemplo

```bash
curl "https://gaiasenses-web.vercel.app/api/v1/now?lat=-23.55&lon=-46.63"
```

```json
{
  "version": "1.0",
  "location": {
    "lat": -23.55,
    "lon": -46.63,
    "radiusKm": 100,
    "city": "São Paulo",
    "state": "São Paulo",
    "country": "BR"
  },
  "weather": {
    "temperature": 24.3,
    "apparentTemperature": 26.1,
    "humidity": 71,
    "surfacePressure": 932.4,
    "pressureMsl": 1013.2,
    "cloudCover": 40,
    "precipitation": 0.2,
    "rain": 0.2,
    "showers": 0,
    "snowfall": 0,
    "weatherCode": 61,
    "wind": { "speed": 11.2, "direction": 130.4, "gust": 24.6 },
    "isDay": true,
    "observedAt": "2026-10-08T17:45:00.000Z"
  },
  "rainSatellite": { "rateMmH": 1.8 },
  "lightning": {
    "count": 2,
    "events": [
      { "lat": -23.51, "lon": -46.71, "energyPj": 1234.5 },
      { "lat": -23.6, "lon": -46.58, "energyPj": 310.2 }
    ]
  },
  "fire": {
    "count": 1,
    "events": [{ "lat": -23.49, "lon": -46.6, "brightness": 331.2 }]
  },
  "sources": {
    "weather": "ok",
    "rainSatellite": "ok",
    "lightning": "ok",
    "fire": "ok",
    "geocoding": "ok"
  },
  "fetchedAt": "2026-10-08T17:52:10.123Z"
}
```

## Semântica — null nunca é zero

Cada fonte responde por si no bloco `sources`: `"ok"`, `"unavailable"` (a fonte
não respondeu ou respondeu erro) ou `"timeout"` (demorou demais; o satélite tem
20 s, as demais 10 s).

- Fonte fora do ar → o bloco dela vem **`null`**. Nunca um número plausível:
  esta API não fabrica clima (é a regra BUG-02 do projeto). Um 200 do backend
  fora do shape esperado também degrada — lixo não vira dado.
- `count: 0` com a fonte `"ok"` é **céu calmo de verdade** — consultamos e não
  havia nada. É informação, e é diferente de `null`, que significa "não
  sabemos".
- `geocoding: "unavailable"` → `location.city/state/country` vêm `null`;
  `lat`, `lon` e `radiusKm` vêm sempre. Para o geocoding, "unavailable" também
  cobre coordenada **sem lugar nomeado** (oceano aberto) — e ele não influencia
  o cache nem o status HTTP: é cosmético, os dados continuam valendo.
- `weather.weatherCode` é o código WMO cru — descrição e idioma são escolha de
  quem consome.
- `weather.rain` (mm da última medição Open-Meteo) e `rainSatellite.rateMmH`
  (taxa mm/h estimada pelo GOES) são produtos diferentes e podem discordar.
- `weather.observedAt` é o instante da observação da Open-Meteo, em **UTC**;
  `fetchedAt` é quando esta resposta foi montada.

### Unidades

Atenção ao vento: a Open-Meteo responde em **km/h**, não no m/s que a
convenção OpenWeather faz supor — sem conversão, o erro é de 3,6×.

| Campo | Unidade |
|---|---|
| `weather.temperature`, `weather.apparentTemperature` | °C |
| `weather.humidity`, `weather.cloudCover` | % |
| `weather.surfacePressure`, `weather.pressureMsl` | hPa |
| `weather.precipitation`, `weather.rain`, `weather.showers` | mm |
| `weather.snowfall` | **cm** |
| `weather.wind.speed`, `weather.wind.gust` | **km/h** |
| `weather.wind.direction` | graus (de onde o vento vem) |
| `rainSatellite.rateMmH` | mm/h |
| `lightning.events[].energyPj` | pJ |
| `fire.events[].brightness` | K (temperatura de brilho VIIRS I-4) |

Status HTTP: `200` enquanto pelo menos uma fonte de dados respondeu (resposta
parcial é dado); `503` quando clima, raios, fogo e chuva estão todos fora;
`400` para entrada inválida.

## Granularidade e frescor

- As coordenadas voltam **arredondadas a 2 casas (~1 km)** — essa é a
  granularidade real: pedidos vizinhos compartilham a mesma resposta.
- Frescor típico: clima até ~25 min; raios, fogo e chuva até ~2 h; nome do
  lugar até 24 h. A resposta pode vir da CDN (header `x-vercel-cache: HIT`).

## Limites

- **30 requisições por minuto por IP.** Acima disso a borda responde `429`
  antes de chegar nesta API — e esse 429 vem **sem headers de CORS**, então no
  navegador aparece como erro de rede opaco. Espacem as chamadas.
- O tráfego público tem uma cota mensal própria no backend de satélite. Se a
  comunidade esgotá-la, `lightning`, `fire` e `rainSatellite` passam a
  responder `"unavailable"` até o início do mês seguinte; `weather` continua.

## Versionamento

O contrato é versionado pelo caminho (`/api/v1`) e pelo campo `version`.
Mudança incompatível vira `/api/v2`; esta rota não muda embaixo de você.

## Por que o desenho é este

A rota anterior morreu por três defeitos, e cada proteção abaixo existe por
causa de um deles. Quem mexer aqui deve manter as quatro camadas:

| Camada | O quê | Onde |
|---|---|---|
| 1. WAF | 30 req/min por IP → 429 na borda | dashboard da Vercel (Firewall), fora do repo — registrado em `docs/contas-e-servicos.md` |
| 2. CDN | `s-maxage=600` saudável, `60` degradado | headers da rota |
| 3. Data Cache | fetch com `revalidate` + coordenada arredondada como chave | `components/getData.ts` (HIG-09) |
| 4. Cota própria | 2ª API key num usage plan separado (2 rps, 20 mil/mês) | `satellite-fetcher-aws` |

- A camada 4 é o teto de custo: abuso público esgota a **cota pública** e vira
  429 — os 50 mil/mês e 10 rps do mapa do site nunca são divididos. Por isso
  **não existe fallback** da `SATELLITE_API_KEY_PUBLIC` para a chave do site.
- O rate limit fica na borda porque função serverless não tem estado
  compartilhado de graça: o contador em memória da rota antiga zerava a cada
  cold start e valia por instância — ou seja, não valia (commit `d8a9b85`).
- Raio fixo e coordenada arredondada mantêm a cardinalidade de cache baixa; um
  `dist` livre seria um vetor de amplificação.

O contrato completo está pinado em `tests/api-v1-now.contract.test.ts`.
