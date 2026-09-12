# ADR-009 — Hospedagem

- **Status:** Aceita
- **Data:** 2026-09-11
- **Referência:** `docs/PLANO_SAAS_FINORA.md`, seção 3

## Contexto
Clientes e dados estarão no Brasil.

## Decisão
**Vercel (região gru1) + Postgres gerenciado em São Paulo** (Neon ou Supabase) com pooler de conexões.

## Consequências
Baixa latência e dados no país, o que facilita a LGPD.
