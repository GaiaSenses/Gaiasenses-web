# Notificações push

Como o push do GaiaSenses funciona, como verificar se está entregando e o que
não pode ser desfeito sem quebrar a segurança. Atualizado em 2026-11-16.

## Peças

| Peça | Onde | Papel |
|---|---|---|
| Formulário | `app/[locale]/notifications/notifications.tsx` (aberto pelo sino em `map3/notifications-dialog.tsx`) | Pede permissão, cria a inscrição no navegador e chama as Server Actions |
| Server Actions | `lib/push/actions.ts` | **Só** `subscribeUser`, `getSubscriptionStatus`, `unsubscribeUser` |
| Regras puras | `lib/push/schedule.ts`, `validation.ts`, `messages.ts`, `deliver.ts` | Agenda, validação, texto das notificações, job de envio. Sem rede, testáveis |
| Acesso a dados e envio | `lib/push/server.ts`, `lib/supabase-admin.ts` | Supabase com service role e `web-push` com VAPID. `server-only` |
| Cron | `vercel.json` → `app/api/notifications/route.ts` | Uma vez por dia, 12:00 UTC (09:00 em Brasília; no Hobby, até 12:59) |
| Saúde | `app/api/health/push/route.ts` | Contagens, sem dado pessoal, atrás do `CRON_SECRET` |
| Service worker | `public/sw.js` | Mostra a notificação, abre o mapa no clique, reinscreve quando o navegador troca o endpoint |
| Reinscrição | `app/api/push/resubscribe/route.ts` | Recebe o endpoint novo do `sw.js` (`pushsubscriptionchange`) |
| PWA | `app/manifest.ts`, `public/icon-*.png`, `public/apple-touch-icon.png` | Necessário para o push no iPhone/iPad |
| Banco | tabela `GaiaSubs` | Ver `supabase/README.md` |

## Fluxo

**Inscrição.** O formulário valida no navegador, chama
`pushManager.subscribe` e manda o resultado para `subscribeUser`. O servidor
valida de novo, calcula o primeiro envio, grava (ou atualiza, se o endpoint já
existe) e manda na hora uma notificação de confirmação. Só depois disso a tela
mostra "inscrito". Se a gravação falha ou o serviço de push recusa o endereço,
o navegador desfaz a inscrição e a tela mostra o motivo.

**Abertura do diálogo.** Se o navegador já tem uma inscrição, a tela pergunta
ao banco (`getSubscriptionStatus`). Se a linha não existe mais, desfaz a
inscrição local e avisa que ela expirou.

**Envio diário.** A Vercel chama `/api/notifications` com
`Authorization: Bearer $CRON_SECRET`. O job reserva quem está devendo
(`next_push <= agora`), envia em lotes de 10 em paralelo e grava o resultado:

| Resposta do serviço de push | O que acontece |
|---|---|
| 201 | `next_push` avança, `last_sent_at` e `last_status` gravados, `fail_count` zera |
| 404 / 410 | Linha apagada na hora (inscrição morreu) |
| 400 / 403 / 413 | `fail_count` sobe; na 3ª falha seguida a linha é apagada |
| rede, 429, 5xx | `fail_count` sobe; tenta de novo no dia seguinte, sem limite |

## Está funcionando?

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://gaiasenses-web.vercel.app/api/health/push
```

`200 {"status":"ok", "subscribers": N, "overdue": 0, "failing": 0, "lastSentAt": "…"}`
quando está tudo em dia. `503 degraded` quando alguém está mais de 26 h
atrasado ou o último envio tem mais de 26 h. `schema: "legacy"` significa que a
migração de 2026-11-16 ainda não foi aplicada.

Nos logs da Vercel, cada execução do cron escreve uma linha
`[notifications] resumo {"due":…,"sent":…,"removed":…,"retryLater":…,"failed":…}`.

## Regras que não podem ser quebradas

1. **Nada de envio em massa em arquivo `"use server"`.** Todo export de um
   arquivo assim, importado por componente client, vira endpoint público. Era
   assim que `sendNotification` podia ser disparado sem o segredo (F-SEC-01,
   confirmado no bundle de produção em 16/11/2026).
   `tests/push-actions-surface.test.ts` reprova o PR que tentar.
2. **Mesmo par VAPID em Production e Preview.** Os dois ambientes gravam no
   mesmo banco. Uma inscrição criada com uma chave pública e enviada com outro
   par recebe 403 e acaba removida.
3. **`GaiaSubs` só com service role.** Nenhuma política de RLS, nenhuma
   concessão a `anon` (ver `supabase/README.md`).

## Testar localmente

O cron local fala com o banco de produção (as variáveis de `.env.local`
apontam para ele) e **envia de verdade** a quem estiver devendo. Para testar a
rota sem enviar, suba com uma service role inválida:

```bash
npm run build
SUPABASE_SERVICE_ROLE_KEY=invalida CRON_SECRET=local npx next start -p 3123
curl -H "Authorization: Bearer local" localhost:3123/api/notifications   # 500, nada enviado
```

A lógica do job é coberta sem rede por `tests/push-deliver.test.ts`.

## Decisões em aberto

- **T45 — nome e e-mail.** Nada no push usa esses campos. Removê-los diminui o
  dado pessoal guardado; é decisão do grupo (`docs/trilha-v1.md`).
- **Mensagem com o clima da cidade.** Exigiria guardar a localização de quem se
  inscreve (mesmo arredondada). Hoje o clique abre `/pt/map3` e o middleware
  posiciona o mapa pela localização aproximada da requisição, sem guardarmos
  nada. Mudar isso pede revisão da política de privacidade.
