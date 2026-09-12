# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Cada entrada cita o ID da tarefa do `docs/PLANO_SAAS_FINORA.md`.

## [Não publicado]

### Adicionado
- ESLint 9 em config flat (`eslint-config-next`, `eslint-plugin-security`), Prettier com o plugin do Tailwind e os scripts `lint`, `format`, `format:check` e `typecheck` (T0.3).
- Regra de lint própria que impede importar o cliente Prisma em arquivo `"use client"` (T0.3).
- Repositório git inicializado na branch `main`, `.gitignore` revisado (ignora `.env`, bancos locais, `coverage/`, `playwright-report/` e `test-results/`) e remote do GitHub configurado (T0.1).
- Documentação de projeto: `CLAUDE.md`, `docs/PLANO_SAAS_FINORA.md`, `docs/README.md` e ADRs 001–012 em `docs/adr/` (T0.2, T0.7).

## [1.0.0] — 2026-09-09
### Adicionado
- Versão de demonstração: dashboard, fluxo de caixa, extrato com CRUD, importação CSV, relatórios, configurações, login por credenciais e histórico de acessos.
