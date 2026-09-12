# ADR-003 — Multiempresa (multi-tenancy)

- **Status:** Aceita
- **Data:** 2026-09-11
- **Referência:** `docs/PLANO_SAAS_FINORA.md`, seção 3

## Contexto
O produto é B2B, mas hoje os dados pertencem a um usuário (achado F12).

## Decisão
Banco compartilhado com coluna **`organizationId`** em toda tabela de negócio, filtrada na camada de serviços. RLS do Postgres como defesa adicional opcional (T5.6).

## Consequências
Simples e barato de operar. Exige disciplina e a suíte de testes de isolamento (T3.4).
