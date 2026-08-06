# De quem é cada conta

Levantado em 6 de agosto de 2026, depois de descobrir — em dois dias — que o
Mapbox e o backend AWS rodavam em contas pessoais de alguém que já não faz parte
do projeto. Este documento existe para que a próxima descoberta dessas não
aconteça durante uma queda.

A pergunta que cada linha responde não é "isso funciona?", e sim: **se essa
conta for encerrada amanhã, o time consegue agir?**

## Situação

| Serviço | Conta | Verificado | Risco |
|---|---|---|---|
| **AWS** (satellite-fetcher) | `283236387908`, do projeto | endpoint responde 200 nas três rotas | ✅ resolvido em ago/2026 |
| **Supabase** | organização **CTI**, plano free | consulta SQL responde | 🟡 plano free pausa por inatividade |
| **Open-Meteo** (clima) | nenhuma — API sem chave | em uso pelo site | ✅ sem conta, sem risco |
| **NASA FIRMS** (`FIRMS_MAP_KEY`) | chave gratuita, cadastro por e-mail | `/fire` responde 200 | 🟡 dono do cadastro não confirmado |
| **OpenWeather** (`OPEN_WEATHER_API_KEY`) | **desconhecida** | chave válida — HTTP 200 | 🔴 ninguém sabe de quem é |
| **Mapbox** | pessoal, de quem saiu do projeto | JWT do token: `{"u":"fmammoli"}` | 🔴 não dá para restringir nem rotacionar |
| **Render** (servidor do controller) | **desconhecida** | `gaiasenses-controller-server.onrender.com` → **HTTP 404** | 🔴 serviço não existe mais |
| **Vercel** (deploy) | organização do projeto | produção no ar | ✅ |
| **VAPID** (push) | par de chaves, não é conta | contato: `gaiasenses.cti@gmail.com` | 🟡 se as chaves se perderem, toda inscrição morre |

## O que fazer com os três vermelhos

**Mapbox** — decisão do time de pesquisa, com material pronto em
[`mapa-alternativas.md`](mapa-alternativas.md): cadastrar um cartão institucional
e criar a conta do projeto, ou migrar para MapLibre, que já tem spike funcionando
e não pede cadastro nem cartão.

**OpenWeather** — a chave funciona, então há uma conta ativa em algum lugar. É
usada só para geocoding reverso, ou seja, converter coordenada em nome de
lugar; o clima em si vem do Open-Meteo, que não pede chave. Duas saídas:
descobrir de quem é a conta, ou trocar o geocoding por um serviço sem cadastro
e eliminar a dependência. A segunda é mais barata do que parece, dado o quão
pequeno é o uso.

**Render** — o servidor já não existe. Isso não é uma conta a recuperar, é a
confirmação de que `/pt/controller` aponta para o nada. A decisão pendente sobre
essa rota — remover ou ressuscitar — agora tem a evidência que faltava.

## O que fazer com os amarelos

**Supabase no plano free** pausa projetos por inatividade. Com o banco pausado,
o cron de push falha e o site perde a telemetria. Também é o que impede o
upgrade do Postgres, que segue com patches de segurança pendentes.

**NASA FIRMS** dá chaves gratuitas por cadastro de e-mail. A chave em uso
funciona, mas ninguém confirmou sob qual e-mail ela foi emitida. Se for pessoal,
vale reemitir sob `gaiasenses.cti@gmail.com` — leva minutos e é a correção mais
barata desta lista.

**VAPID** não é conta, é um par de chaves. Mas a pública está gravada em toda
inscrição de push já feita: perder a privada significa que nenhuma delas volta a
receber nada, e não há como reemitir sem pedir a todo mundo que se inscreva de
novo. Vale garantir que ela esteja guardada em algum lugar além das variáveis da
Vercel.

## Como refazer este levantamento

O que revelou o Mapbox foi decodificar o token: todo token do Mapbox é um JWT
com o dono no payload.

```bash
python3 -c "
import base64, json, sys
p = sys.argv[1].split('.')[1]
print(json.loads(base64.urlsafe_b64decode(p + '=' * (-len(p) % 4))))
" "$NEXT_PUBLIC_MAPBOX_API_ACCESS_TOKEN"
```

Para os demais não existe truque equivalente — chave de API não costuma carregar
o dono. O caminho é entrar no painel de cada serviço e olhar o e-mail da conta.
Vale refazer sempre que alguém sair do projeto.
