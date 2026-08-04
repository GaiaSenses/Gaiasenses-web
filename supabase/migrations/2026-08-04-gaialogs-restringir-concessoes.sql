-- GaiaLogs só precisa receber INSERT do navegador.
--
-- As concessões padrão davam a `anon` também SELECT, UPDATE, DELETE e TRUNCATE.
-- SELECT/UPDATE/DELETE já eram barrados pelo RLS, que só tem política de INSERT.
-- TRUNCATE não: RLS não se aplica a TRUNCATE, então a concessão era a única
-- coisa entre a chave pública e o apagamento dos 7.659 registros de pesquisa.
-- Não era alcançável pela API REST, que não expõe TRUNCATE, mas não há motivo
-- para manter a permissão.
--
-- O insert do app não precisa de SELECT: `components/supabase.ts` chama
-- `.insert()` sem `.select()`, então o PostgREST não devolve representação.
-- Verificado com a chave anon real antes e depois: HTTP 201 nos dois casos.

revoke all on public."GaiaLogs" from anon, authenticated;
grant insert on public."GaiaLogs" to anon, authenticated;
