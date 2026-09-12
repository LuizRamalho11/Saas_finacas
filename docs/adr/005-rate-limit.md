# ADR-005 — Rate limit

- **Status:** Aceita
- **Data:** 2026-09-11
- **Referência:** `docs/PLANO_SAAS_FINORA.md`, seção 3

## Contexto
Não há limite de tentativas no login nem nas actions (achado F03).

## Decisão
Interface `RateLimiter` com **Upstash Redis** em produção e memória em dev/test; rotas de autenticação usam também o limitador do Better Auth.

## Consequências
Funciona em ambiente serverless. Custo: um serviço externo a mais.
