# Trilha da Estabilização v1

Acompanhamento do fechamento da estabilização v1 do GaiaSenses. Fonte de verdade
operacional: as issues linkadas (fecham por `Closes #n` nos PRs); os quadros vivem
no [projeto Kanban da organização](https://github.com/orgs/GaiaSenses/projects/1).
O dossiê completo (planos, pareceres, relatórios) está em
[gaiasenses-docs](https://github.com/GaiaSenses/gaiasenses-docs).

**30/50 tasks concluídas** (gerado do estado vivo das issues em 2026-09-08).
Marcos do dia: backend deployado na conta do projeto com Blocos 1 e 3 valendo em
produção; as duas credenciais vazadas rotacionadas e verificadas (T11); custo
US$ 0,00 com ECR de volta ao free tier e faxina automática; alarmes de saúde e
access log no ar (T24).

A coluna **Decisão do grupo?** marca o que não anda só com engenharia: **Sim** = parado
esperando decisão de terceiros (e de quem); *Indireta* = destrava quando outra decisão sair; **Não** = executável.

| ✓ | Task | Título | Issue | Depende | Decisão do grupo? |
|---|---|---|---|---|---|
| [x] | T01 | Ressincronizar os clones locais com a main remota | [Gaiasenses-web#103](https://github.com/GaiaSenses/Gaiasenses-web/issues/103) | — | Não |
| [x] | T02 | Auditar os commits da onda de alunos | [Gaiasenses-web#104](https://github.com/GaiaSenses/Gaiasenses-web/issues/104) | T01 | Não |
| [x] | T03 | Religar o check obrigatório na main do web | [Gaiasenses-web#105](https://github.com/GaiaSenses/Gaiasenses-web/issues/105) | T01 | Não |
| [x] | T04 | Check obrigatório na main do fetcher | [satellite-fetcher-aws#8](https://github.com/GaiaSenses/satellite-fetcher-aws/issues/8) | — | Não |
| [ ] | T05 | Parecer do PR #101 (reescrita do scoring) — decisão pendente | [Gaiasenses-web#106](https://github.com/GaiaSenses/Gaiasenses-web/issues/106) | T01·T02 | **Sim** — Nycholas + orientador FAPESP |
| [ ] | T06 | Executar a decisão sobre o PR #101 | [Gaiasenses-web#107](https://github.com/GaiaSenses/Gaiasenses-web/issues/107) | T03·T05 | Indireta — executa a decisão do T05 |
| [x] | T07 | Mover rain2 para patches/ e remover testeGit (PR #102) | [Gaiasenses-web#108](https://github.com/GaiaSenses/Gaiasenses-web/issues/108) | T02·T03 | Não |
| [x] | T08 | Triagem dos 12 PRs de teste (#87–#100) | [Gaiasenses-web#109](https://github.com/GaiaSenses/Gaiasenses-web/issues/109) | T01 | Não |
| [x] | T09 | CRÍTICA: parar de logar o event do proxy (x-api-key + IP) | [satellite-fetcher-aws#9](https://github.com/GaiaSenses/satellite-fetcher-aws/issues/9) | T04 | Não |
| [x] | T10 | Redigir a FIRMS_MAP_KEY do log de URL | [satellite-fetcher-aws#10](https://github.com/GaiaSenses/satellite-fetcher-aws/issues/10) | T04 | Não |
| [x] | T11 | Rotacionar as 2 credenciais expostas (após T09/T10) | [Gaiasenses-web#113](https://github.com/GaiaSenses/Gaiasenses-web/issues/113) | T09·T10 | Não |
| [x] | T12 | reservedConcurrentExecutions: 10 na Lambda | [satellite-fetcher-aws#11](https://github.com/GaiaSenses/satellite-fetcher-aws/issues/11) | T04 | Não |
| [ ] | T13 | Validar o cookie de localização antes do insert | [Gaiasenses-web#114](https://github.com/GaiaSenses/Gaiasenses-web/issues/114) | T03·T06 | Não |
| [ ] | T14 | Minimizar coordenadas no GaiaLogs (célula ~4 km) | [Gaiasenses-web#115](https://github.com/GaiaSenses/Gaiasenses-web/issues/115) | T06 | Não |
| [x] | T15 | Cookie userLocation com httpOnly+secure+sameSite | [Gaiasenses-web#116](https://github.com/GaiaSenses/Gaiasenses-web/issues/116) | T03 | Não |
| [x] | T16 | TTL de 24h na localização (REC-03 parcial) | [Gaiasenses-web#117](https://github.com/GaiaSenses/Gaiasenses-web/issues/117) | T15 | Não |
| [ ] | T17 | Página de política de privacidade (pt+en) | [Gaiasenses-web#118](https://github.com/GaiaSenses/Gaiasenses-web/issues/118) | T14 | Não |
| [x] | T18 | Pinar requirements.txt + digest no Dockerfile | [satellite-fetcher-aws#12](https://github.com/GaiaSenses/satellite-fetcher-aws/issues/12) | T04 | Não |
| [x] | T19 | Corrigir Point(lat,lon) invertido E a compensação juntos (BUG-03) | [satellite-fetcher-aws#13](https://github.com/GaiaSenses/satellite-fetcher-aws/issues/13) | T18 | Não |
| [x] | T20 | Entrada inválida → 400; dist com default único e clamp | [satellite-fetcher-aws#14](https://github.com/GaiaSenses/satellite-fetcher-aws/issues/14) | T18 | Não |
| [x] | T21 | Remover geopandas sem uso (GDAL fora da imagem) | [satellite-fetcher-aws#15](https://github.com/GaiaSenses/satellite-fetcher-aws/issues/15) | T18 | Não |
| [x] | T22 | Vetorizar o laço flash-a-flash do /lightning | [satellite-fetcher-aws#16](https://github.com/GaiaSenses/satellite-fetcher-aws/issues/16) | T18·T19 | Não |
| [x] | T23 | Fallback para o slot GOES anterior | [satellite-fetcher-aws#17](https://github.com/GaiaSenses/satellite-fetcher-aws/issues/17) | T18 | Não |
| [x] | T24 | Access log + alarmes 5xx/Throttles/Duration → e-mail | [satellite-fetcher-aws#18](https://github.com/GaiaSenses/satellite-fetcher-aws/issues/18) | T12·T18 | Não |
| [x] | T25 | Health-check das fontes /fire e /lightning no web | [Gaiasenses-web#119](https://github.com/GaiaSenses/Gaiasenses-web/issues/119) | T11·T24 | Não |
| [ ] | T26 | Reverificar e remover a dependência tone | [Gaiasenses-web#120](https://github.com/GaiaSenses/Gaiasenses-web/issues/120) | T01·T06 | Não |
| [x] | T27 | dev-remote sem IP fixo | [Gaiasenses-web#121](https://github.com/GaiaSenses/Gaiasenses-web/issues/121) | T03 | Não |
| [ ] | T28 | Corrigir vazamento de timers do modo automático | [Gaiasenses-web#122](https://github.com/GaiaSenses/Gaiasenses-web/issues/122) | T06 | Não |
| [ ] | T29 | Remover console.log de scores do player | [Gaiasenses-web#123](https://github.com/GaiaSenses/Gaiasenses-web/issues/123) | T06 | Não |
| [x] | T30 | Testar o alarme de custo + runbook (OPS-05) | [Gaiasenses-web#124](https://github.com/GaiaSenses/Gaiasenses-web/issues/124) | T24 (confirmação SNS) | Não |
| [x] | T31 | Rate-limit do cadastro de push via WAF da Vercel | [Gaiasenses-web#125](https://github.com/GaiaSenses/Gaiasenses-web/issues/125) | — | Não |
| [ ] | T32 | Arquivar o repo legado satellite-fetcher | [Gaiasenses-web#126](https://github.com/GaiaSenses/Gaiasenses-web/issues/126) | T11 | Não |
| [x] | T33 | Primeira release v1.0.0 nos 2 repos | [Gaiasenses-web#127](https://github.com/GaiaSenses/Gaiasenses-web/issues/127) | Blocos 0·1·3 | Não |
| [x] | T34 | Criar as labels de governança nos 2 repos | [Gaiasenses-web#110](https://github.com/GaiaSenses/Gaiasenses-web/issues/110) | — | Não |
| [x] | T35 | Milestones + issues 1:1 + tabela-espelho | [Gaiasenses-web#111](https://github.com/GaiaSenses/Gaiasenses-web/issues/111) | T34 | Não |
| [x] | T36 | Template genérico de Pull Request | [Gaiasenses-web#128](https://github.com/GaiaSenses/Gaiasenses-web/issues/128) | T34 | Não |
| [x] | T37 | Guard-rail: patch fora de patches/ reprova no CI | [Gaiasenses-web#129](https://github.com/GaiaSenses/Gaiasenses-web/issues/129) | T03·T36 | Não |
| [ ] | T38 | Upgrade next 14→15 + next-intl 3→4 | [Gaiasenses-web#130](https://github.com/GaiaSenses/Gaiasenses-web/issues/130) | T03·T06·T07·T26 | Não |
| [ ] | T39 | npm audit no CI (+ smoke e2e opcional) | [Gaiasenses-web#131](https://github.com/GaiaSenses/Gaiasenses-web/issues/131) | T38 | Não |
| [x] | T40 | Versionar o dossiê my-docs | [Gaiasenses-web#112](https://github.com/GaiaSenses/Gaiasenses-web/issues/112) | — | Não |
| [ ] | T41 | Reescrever o README do fetcher (hoje: boilerplate CDK) | [satellite-fetcher-aws#19](https://github.com/GaiaSenses/satellite-fetcher-aws/issues/19) | T11·T18 | Não |
| [x] | T42 | Corrigir Known Issues + linkar o dossiê no README | [Gaiasenses-web#132](https://github.com/GaiaSenses/Gaiasenses-web/issues/132) | T40 | Não |
| [ ] | T43 | DECISÃO 8.1: multicanal 4.1/5.1 (REC-07) | [Gaiasenses-web#133](https://github.com/GaiaSenses/Gaiasenses-web/issues/133) | — | **Sim** — grupo GaiaSenses |
| [ ] | T44 | DECISÃO 8.2: /rain — ratificar manter ou remover | [Gaiasenses-web#134](https://github.com/GaiaSenses/Gaiasenses-web/issues/134) | — | **Sim** — grupo GaiaSenses |
| [ ] | T45 | DECISÃO 8.5: campo e-mail no cadastro de push | [Gaiasenses-web#135](https://github.com/GaiaSenses/Gaiasenses-web/issues/135) | — | **Sim** — grupo / coordenação |
| [ ] | T46 | DECISÃO: citação CEPAGRI / Earth Engine | [Gaiasenses-web#136](https://github.com/GaiaSenses/Gaiasenses-web/issues/136) | — | **Sim** — coordenação |
| [ ] | T47 | DECISÃO: Mapbox — conta institucional × MapLibre | [Gaiasenses-web#137](https://github.com/GaiaSenses/Gaiasenses-web/issues/137) | — | **Sim** — coordenação CTI |
| [ ] | T48 | DECISÃO: curadoria de ENABLED_COMPOSITIONS | [Gaiasenses-web#138](https://github.com/GaiaSenses/Gaiasenses-web/issues/138) | — | **Sim** — equipe artística |
| [ ] | T49 | Modo exposição: watchdog/kiosk + trajetória fora do localStorage | [Gaiasenses-web#139](https://github.com/GaiaSenses/Gaiasenses-web/issues/139) | T28·T43·T47 | Indireta — via T43·T47 |
| [ ] | T50 | Ensaio de regime de exposição + checklist | [Gaiasenses-web#140](https://github.com/GaiaSenses/Gaiasenses-web/issues/140) | T49 | Indireta — via T49 |
