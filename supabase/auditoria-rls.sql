-- Auditoria de RLS e permissões — SOMENTE LEITURA.
--
-- Nenhuma consulta aqui altera nada. Rode tudo, copie a saída e leve para a
-- discussão do SEC-04, que hoje está aberto justamente porque as políticas do
-- Supabase não estão versionadas no repositório e o estado real é desconhecido.
--
-- ATENÇÃO: não ligue RLS nem crie política nenhuma sem antes ver estes
-- resultados. `GaiaLogs` recebe inserções direto do navegador com a chave
-- anônima (components/supabaseClient.ts). Se o RLS estiver desligado hoje e for
-- ligado sem uma política de INSERT correspondente, a telemetria para de gravar
-- em produção na mesma hora — e falha em silêncio, porque o erro só aparece no
-- console do visitante.

-- 1) O RLS está ligado em cada tabela?
--    relrowsecurity = RLS ativo · relforcerowsecurity = vale até para o dono
select
  c.relname                as tabela,
  c.relrowsecurity         as rls_ligado,
  c.relforcerowsecurity    as rls_forcado
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'r'
order by c.relname;

-- 2) Quais políticas existem, e o que exatamente elas permitem?
--    Uma política de INSERT com with_check = 'true' aceita qualquer payload.
select
  tablename   as tabela,
  policyname  as politica,
  permissive,
  roles,
  cmd         as comando,
  qual        as condicao_leitura,
  with_check  as condicao_escrita
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) O que os papéis públicos podem fazer, independentemente de RLS.
--    `anon` é a chave que vai no bundle do navegador: qualquer visitante a tem.
--    Um SELECT aqui em GaiaSubs significaria e-mails de inscritos legíveis por
--    qualquer pessoa na internet.
select
  grantee        as papel,
  table_name     as tabela,
  privilege_type as privilegio
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'public')
order by table_name, grantee, privilege_type;

-- 4) Volume e composição da telemetria (rode depois da migração do origin).
select
  origin,
  count(*)          as linhas,
  min(created_at)   as primeira,
  max(created_at)   as ultima
from public."GaiaLogs"
group by origin
order by linhas desc;

-- 5) Quantos inscritos de push existem, e desde quando.
--    Serve para dimensionar a decisão 8.5 do plano (remover o campo e-mail) e a
--    política de retenção do LGPD-01.
select count(*) as inscritos from public."GaiaSubs";
