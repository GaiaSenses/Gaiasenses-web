-- GaiaSubs: registro de entrega, idioma e reserva atômica das linhas do cron.
--
-- Por que isto existe
-- -------------------
-- Até aqui a tabela só guardava `next_push`. Não havia como responder "a pessoa
-- recebeu?", nem como distinguir "o cron não rodou" de "o serviço de push
-- recusou". Erros permanentes (403 de par VAPID trocado, 400) eram tentados de
-- novo todo dia, para sempre. E o cron lia as linhas sem reservá-las: se a
-- Vercel entregasse a mesma execução duas vezes (a documentação admite que
-- pode), a mesma pessoa recebia duas notificações.
--
-- O que muda
-- ----------
-- * locale        — idioma de quem se inscreveu ('pt' | 'en'): texto da
--                   notificação e página aberta pelo clique.
-- * last_sent_at  — último envio aceito pelo serviço de push.
-- * last_status   — status HTTP da última tentativa (201 = entregue ao serviço).
-- * fail_count    — falhas seguidas; o app apaga a linha depois de 3 falhas
--                   permanentes (lib/push/messages.ts, MAX_PERMANENT_FAILURES).
-- * claimed_until — reserva temporária enquanto uma execução do cron processa
--                   a linha. Outra execução simultânea não a pega.
-- * claim_due_push_subscriptions(p_now) — reserva e devolve, numa única
--   instrução, quem está devendo. `for update skip locked` garante que duas
--   execuções paralelas nunca peguem a mesma linha.
--
-- Segurança de execução
-- ---------------------
-- Idempotente e retrocompatível. O código novo funciona ANTES desta migração
-- (detecta a função ausente e volta ao modo antigo, avisando no log), então ela
-- não é pré-requisito de deploy — é o que liga o registro de entrega.
--
-- Como rodar: Dashboard → SQL Editor → New query → cole este arquivo → Run.

alter table public."GaiaSubs"
  add column if not exists locale        text        not null default 'pt',
  add column if not exists last_sent_at  timestamptz,
  add column if not exists last_status   integer,
  add column if not exists fail_count    integer     not null default 0,
  add column if not exists claimed_until timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'GaiaSubs_locale_check'
  ) then
    alter table public."GaiaSubs"
      add constraint "GaiaSubs_locale_check" check (locale in ('pt', 'en'));
  end if;
end $$;

comment on column public."GaiaSubs".locale        is 'Idioma da inscrição (pt|en): texto do push e página aberta no clique.';
comment on column public."GaiaSubs".last_sent_at  is 'Último envio aceito pelo serviço de push.';
comment on column public."GaiaSubs".last_status   is 'Status HTTP da última tentativa (201 = aceito). null = erro de rede.';
comment on column public."GaiaSubs".fail_count    is 'Falhas seguidas. Zera a cada envio aceito.';
comment on column public."GaiaSubs".claimed_until is 'Reserva do cron em andamento; ignorada depois que expira.';

-- O cron filtra por next_push todo dia.
create index if not exists "GaiaSubs_next_push_idx" on public."GaiaSubs" (next_push);

create or replace function public.claim_due_push_subscriptions(
  p_now   timestamptz,
  p_lease interval default interval '10 minutes'
)
returns setof public."GaiaSubs"
language sql
volatile
set search_path = public
as $$
  update public."GaiaSubs" s
     set claimed_until = p_now + p_lease
   where s.user_id in (
     select user_id
       from public."GaiaSubs"
      where next_push <= p_now
        and (claimed_until is null or claimed_until < p_now)
      for update skip locked
   )
  returning s.*;
$$;

comment on function public.claim_due_push_subscriptions(timestamptz, interval) is
  'Reserva por p_lease e devolve as inscrições com next_push <= p_now. '
  'Chamada só pelo cron (/api/notifications) com a service role.';

-- A tabela tem PII e a função devolve linhas inteiras: só o servidor executa.
revoke all on function public.claim_due_push_subscriptions(timestamptz, interval) from public, anon, authenticated;
grant execute on function public.claim_due_push_subscriptions(timestamptz, interval) to service_role;
