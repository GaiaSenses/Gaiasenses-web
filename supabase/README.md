# Supabase — esquema e auditoria

O projeto Supabase **não é gerenciado por migração automática**: não há CLI do
Supabase no pipeline e o estado real do banco vive só no dashboard. Esta pasta
existe para que pelo menos as mudanças que fazemos fiquem versionadas e
revisáveis, em vez de acontecerem por clique e sumirem do histórico.

Projeto: `iyuroutnhzvrwebihuyu` ·
[SQL Editor](https://supabase.com/dashboard/project/iyuroutnhzvrwebihuyu/sql)

## Como rodar

Dashboard → **SQL Editor** → **New query** → cole o arquivo → **Run**.

## Ordem recomendada

| # | Arquivo | O que faz | Risco |
|---|---|---|---|
| 1 | `migrations/2026-08-04-gaialogs-origin.sql` | Coluna `origin` no `GaiaLogs` | Nenhum — idempotente e retrocompatível |
| 2 | `auditoria-rls.sql` | Diagnóstico de RLS e permissões | Nenhum — somente leitura |

**Não altere políticas de RLS com base em suposição.** `GaiaLogs` recebe
inserções direto do navegador com a chave anônima; ligar RLS sem a política de
INSERT correspondente derruba a telemetria em produção silenciosamente. Rode a
auditoria, leve o resultado para a discussão do SEC-04, e só então decida.

## Tabelas em uso

| Tabela | Quem escreve | Com qual chave |
|---|---|---|
| `GaiaLogs` | `components/supabase.ts`, via `DataSender` no fim de cada sessão | **anônima**, do navegador |
| `GaiaSubs` | `lib/notifications.js` | **service role**, no servidor |

Colunas do `GaiaLogs` (nomes em maiúsculas/minúsculas mistas, então precisam de
aspas em SQL): `name`, `temperature`, `humidity`, `wind_speed`,
`lightning_count`, `"fireSpots_count"`, `date_timeplayed`, `pinnedlocation`,
`userlocation`, `"timeSpent"`, `origin`.
