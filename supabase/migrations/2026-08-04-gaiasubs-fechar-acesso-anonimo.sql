-- SEC-03 (revisado): fechar o acesso anônimo à tabela GaiaSubs.
--
-- O que a auditoria de 2026-08-04 encontrou
-- -----------------------------------------
-- `GaiaSubs` tem RLS ligado, o que passa a impressão de estar protegida. Mas as
-- quatro políticas existentes concedem SELECT, INSERT, UPDATE e DELETE ao papel
-- `anon` com a condição `true` — sem nenhuma restrição.
--
-- `anon` é a chave que vai no bundle JavaScript de um site público. Qualquer
-- visitante a tem. Confirmado na prática com a chave real:
--
--   GET /rest/v1/GaiaSubs?select=name,email,subscription
--   → HTTP 206, 5 linhas, com nome, e-mail e endpoint de push legíveis.
--
-- E não é só leitura: as políticas de UPDATE e DELETE também aceitam `anon`,
-- então qualquer pessoa pode alterar ou apagar os inscritos.
--
-- Repare que a política de INSERT se chama "Enable insert for authenticated
-- users only" mas lista `anon` entre os papéis — o nome descreve uma intenção
-- que o conteúdo não cumpre. As outras têm nomes de template do dashboard
-- ("Policy with table joins"), sinal de que foram criadas por clique e nunca
-- revisadas.
--
-- Por que remover não quebra nada
-- -------------------------------
-- `GaiaSubs` é tocada exclusivamente por `lib/notifications.js`, que é
-- `"use server"` e usa `SUPABASE_SERVICE_ROLE_KEY` (`lib/usersdb.js`). O papel
-- `service_role` ignora RLS por definição e tem concessões próprias, então
-- continua funcionando. Nenhum código de navegador lê ou escreve nesta tabela —
-- verificado por varredura em `app/`, `components/` e `lib/`.
--
-- Com RLS ligado e nenhuma política, `anon` não enxerga nada. O `revoke` é
-- redundante de propósito: se alguém recriar uma política por engano no
-- dashboard, a ausência de concessão ainda barra o acesso.

drop policy if exists "Enable read access for all users"          on public."GaiaSubs";
drop policy if exists "Enable insert for authenticated users only" on public."GaiaSubs";
drop policy if exists "Enable delete for users based on user_id"   on public."GaiaSubs";
drop policy if exists "Policy with table joins"                    on public."GaiaSubs";

revoke all on public."GaiaSubs" from anon, authenticated;

comment on table public."GaiaSubs" is
  'Inscritos de push: contém PII (nome, e-mail, endpoint de subscription). '
  'Acesso EXCLUSIVO via service_role, do servidor (lib/notifications.js). '
  'Não conceda nada a anon nem a authenticated: a chave anon é pública.';
