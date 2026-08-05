-- Um endpoint de push identifica um navegador. Sem esta trava, reinscrever o
-- mesmo navegador criava linha nova a cada vez: PII duplicada e o mesmo aparelho
-- recebendo a notificação várias vezes por execução do cron.
--
-- Não é limite de taxa. Um script ainda consegue inserir linhas com endpoints
-- diferentes; limitar isso de verdade exige proteção na plataforma (WAF da
-- Vercel), porque em serverless não há estado compartilhado, e guardar IP para
-- contar tentativas conflitaria com a minimização exigida pela LGPD.
--
-- Verificado antes de aplicar: 5 linhas, 5 endpoints distintos, sem duplicatas.
-- `subscribeUser` trata a violação (código 23505) como "já inscrito", não erro.

create unique index if not exists "GaiaSubs_subscription_endpoint_key"
  on public."GaiaSubs" ((subscription->>'endpoint'));
