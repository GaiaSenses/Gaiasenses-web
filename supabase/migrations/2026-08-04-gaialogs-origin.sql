-- GaiaLogs: marcar de qual ambiente veio cada registro.
--
-- Por que isto existe
-- -------------------
-- Os deploys de preview da Vercel são públicos (a Deployment Protection foi
-- desligada para que músicos possam ouvir os patches de um pull request sem
-- login). Previews herdam as variáveis do ambiente Preview, que por padrão
-- apontam para ESTE MESMO projeto Supabase. Sem esta coluna, cada teste de
-- músico, cada clique de dev e cada rastreador que passar por uma preview grava
-- uma linha indistinguível de dado de público real — contaminando o corpus de
-- pesquisa (pedido A5 da Profa. Artemis / REC-01) de forma irreversível, porque
-- depois do fato não há como separar.
--
-- Segurança de execução
-- ---------------------
-- Idempotente e retrocompatível: pode rodar mais de uma vez, e o código que
-- ainda não envia `origin` continua funcionando (o default cobre). O código novo
-- também funciona ANTES desta migração — ele detecta a coluna ausente e grava
-- sem a marca, avisando no console. Ou seja, esta migração não é pré-requisito
-- de deploy; é o que faz a marcação começar a valer.
--
-- Linhas antigas ficam como 'unknown' de propósito. Elas foram gravadas quando
-- não havia como saber a origem, e inventar 'production' para elas seria mentir
-- no dado de pesquisa.

alter table public."GaiaLogs"
  add column if not exists origin text not null default 'unknown';

comment on column public."GaiaLogs".origin is
  'Ambiente que gerou o registro: production | preview | development | local | unknown. '
  'Preenchido por NEXT_PUBLIC_VERCEL_ENV em components/supabase.ts. '
  'SEMPRE filtre por origin = ''production'' em qualquer análise de pesquisa.';

-- Toda análise séria vai filtrar por esta coluna, e a tabela só cresce.
create index if not exists "GaiaLogs_origin_idx"
  on public."GaiaLogs" (origin);
