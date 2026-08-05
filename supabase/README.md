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

Todas as migrações abaixo **já foram aplicadas em 2026-08-04** e verificadas
contra o banco real. Estão aqui como registro do que foi feito e por quê.

| # | Arquivo | O que faz |
|---|---|---|
| 1 | `migrations/2026-08-04-gaiasubs-fechar-acesso-anonimo.sql` | Fecha leitura/escrita anônima de PII no `GaiaSubs` |
| 2 | `migrations/2026-08-04-gaialogs-origin.sql` | Coluna `origin` no `GaiaLogs` |
| 3 | `migrations/2026-08-04-gaialogs-restringir-concessoes.sql` | `anon` no `GaiaLogs` fica só com INSERT |
| — | `auditoria-rls.sql` | Diagnóstico de RLS e permissões (somente leitura) |

## Estado verificado após as migrações

| Tabela | RLS | Políticas | O que `anon` pode |
|---|---|---|---|
| `GaiaLogs` | ligado | 1 (INSERT) | apenas `INSERT` |
| `GaiaSubs` | ligado | 0 | **nada** |

**Não altere políticas de RLS com base em suposição.** `GaiaLogs` recebe
inserções direto do navegador com a chave anônima: remover a política ou a
concessão de INSERT derruba a telemetria em produção silenciosamente, porque o
erro só aparece no console do visitante. Rode `auditoria-rls.sql` antes de mexer.

**O advisor de segurança do Supabase não pega este tipo de problema.** Antes da
correção ele reportava apenas a versão do Postgres: para ele, RLS ligado com
políticas parecia saudável, mesmo com as políticas liberando tudo para `anon`.

## Tabelas em uso

| Tabela | Quem escreve | Com qual chave |
|---|---|---|
| `GaiaLogs` | `components/supabase.ts`, via `DataSender` no fim de cada sessão | **anônima**, do navegador |
| `GaiaSubs` | `lib/notifications.js` | **service role**, no servidor |

Colunas do `GaiaLogs` (nomes em maiúsculas/minúsculas mistas, então precisam de
aspas em SQL): `name`, `temperature`, `humidity`, `wind_speed`,
`lightning_count`, `"fireSpots_count"`, `date_timeplayed`, `pinnedlocation`,
`userlocation`, `"timeSpent"`, `origin`.
