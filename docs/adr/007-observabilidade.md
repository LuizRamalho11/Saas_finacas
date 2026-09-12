# ADR-007 — Observabilidade

- **Status:** Aceita
- **Data:** 2026-09-11
- **Referência:** `docs/PLANO_SAAS_FINORA.md`, seção 3

## Contexto
Não há logs estruturados nem monitoramento de erros (achado F22).

## Decisão
**pino** com redação de campos sensíveis e `requestId` por requisição + **Sentry** com remoção de dados pessoais.

## Consequências
Diagnóstico rápido de incidentes sem vazar dados em logs.
