# ADR-010 — Camada de ações e serviços

- **Status:** Aceita
- **Data:** 2026-09-11
- **Referência:** `docs/PLANO_SAAS_FINORA.md`, seção 3

## Contexto
Cada Server Action repete autenticação e tratamento de erro, e parâmetros de leitura não são validados (achado F05).

## Decisão
Wrapper próprio **`defineAction`** (auth, permissão, Zod, rate limit, auditoria, erros) e regras de negócio em **`lib/services/`**.

## Consequências
Segurança centralizada; actions finas e serviços testáveis isoladamente.
