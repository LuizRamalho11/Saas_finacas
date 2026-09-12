# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Cada entrada cita o ID da tarefa do `docs/PLANO_SAAS_FINORA.md`.

## [Não publicado]

### Segurança
- Importação de CSV: a confirmação recebe as linhas cruas e o servidor refaz toda a validação (valor, data, tipo, status, posse da categoria e da conta), em vez de confiar no que o cliente diz ter conferido. Teto de 5.000 linhas e 2 MB por importação, gravação em transação única (T1.6, F06).
- Exportação de CSV: célula que começa com `=`, `+`, `-`, `@`, tabulação ou retorno de carro é neutralizada com apóstrofo, então uma descrição maliciosa não vira fórmula ao abrir a planilha; o BOM passou a ser gerado no servidor (T1.6, F07).
- Cabeçalhos de segurança em todas as respostas: HSTS (só em produção), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` e `Cross-Origin-Opener-Policy`; `X-Powered-By` deixou de ser enviado. A CSP entra em modo relatório, com a versão bloqueante por nonce prevista para a T5.1 (T1.5, F08).
- Login com rate limit (5/min por IP, 10/15 min por e-mail), bloqueio progressivo da conta (15 min, 1 h, 24 h a partir da 10ª falha seguida) e tempo de resposta igual para e-mail inexistente e senha errada (T1.4, F03/F04).
- O IP do histórico de acesso e do rate limit deixa de sair de um cabeçalho que o cliente controla: só é aceito o proxy declarado em `TRUSTED_PROXY` (T1.4, F17).
- Open redirect fechado: `?redirectTo=` passa por `safeRedirect()`, que só aceita caminho relativo de uma rota interna conhecida. Destino externo cai no dashboard (T1.3, F02).
- Sessão revogada passa a valer como revogada: `requireUser()` confere a linha em `Session` (existência, `revokedAt`, `expiresAt` e inatividade de 12 h), o cookie caiu de 30 para 7 dias e `lastSeenAt` é gravado no máximo a cada 5 min. Logout e "encerrar outras sessões" agora derrubam o cookie na requisição seguinte (T1.2, F01).
- `defineAction`/`defineQuery`/`definePublicAction`: toda função exportada de arquivo `"use server"` passa por um wrapper que resolve a sessão, valida os parâmetros com Zod e traduz erros. Parâmetros de leitura ganharam teto (`pageSize` ≤ 100, `months` ≤ 36, `limit` ≤ 50, importação ≤ 5.000 linhas), fechando a extração em massa do achado F05 (T1.1).
- Erro inesperado não vaza mais detalhe interno para a interface: vira mensagem genérica em pt-BR com um `requestId` no log do servidor (T1.1).

### Corrigido
- Cinco vulnerabilidades altas herdadas de dependências transitivas (`postcss` dentro do Next, `mysql2` e `deepmerge-ts` dentro do Prisma), resolvidas por `overrides` sem mudar as versões do Next e do Prisma (T0.6, ADR-013).

### Adicionado
- CI no GitHub Actions (lint, formatação, typecheck, testes, build, E2E nos PRs, `npm audit` e gitleaks) e Dependabot semanal para npm e Actions (T0.6).
- Infraestrutura de testes: Vitest com os projetos `unit` e `integration` (PostgreSQL embarcado próprio, migrations e tabelas limpas entre testes), factories, e Playwright com banco e servidor isolados. Primeiros testes: `parseAmount`, schemas Zod, `lib/env.ts`, isolamento de lançamentos entre usuários e login/logout ponta a ponta (T0.5).
- `lib/env.ts`: variáveis de ambiente validadas com Zod na partida do servidor (via `instrumentation.ts`), com mensagens em pt-BR que nunca citam o valor. `AUTH_SECRET` e `AUTH_TRUST_HOST` deixam de ser fixos no código e `APP_URL` passa a existir (T0.4, F18).
- ESLint 9 em config flat (`eslint-config-next`, `eslint-plugin-security`), Prettier com o plugin do Tailwind e os scripts `lint`, `format`, `format:check` e `typecheck` (T0.3).
- Regra de lint própria que impede importar o cliente Prisma em arquivo `"use client"` (T0.3).
- Repositório git inicializado na branch `main`, `.gitignore` revisado (ignora `.env`, bancos locais, `coverage/`, `playwright-report/` e `test-results/`) e remote do GitHub configurado (T0.1).
- Documentação de projeto: `CLAUDE.md`, `docs/PLANO_SAAS_FINORA.md`, `docs/README.md` e ADRs 001–012 em `docs/adr/` (T0.2, T0.7).

## [1.0.0] — 2026-09-09
### Adicionado
- Versão de demonstração: dashboard, fluxo de caixa, extrato com CRUD, importação CSV, relatórios, configurações, login por credenciais e histórico de acessos.
