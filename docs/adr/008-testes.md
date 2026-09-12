# ADR-008 — Estratégia de testes

- **Status:** Aceita
- **Data:** 2026-09-11
- **Referência:** `docs/PLANO_SAAS_FINORA.md`, seção 3

## Contexto
O projeto não tem testes automatizados (achado F19).

## Decisão
**Vitest** (unitário e integração com Postgres real via `embedded-postgres`) + **Playwright** (E2E e acessibilidade com axe).

## Consequências
Testes rodam sem Docker, igual ao fluxo de desenvolvimento atual.
