# ADR-002 — Modelo de sessão

- **Status:** Aceita
- **Data:** 2026-09-11
- **Referência:** `docs/PLANO_SAAS_FINORA.md`, seção 3

## Contexto
Com JWT de 30 dias, logout e "encerrar outras sessões" não invalidam o token (achado F01).

## Decisão
Sessão **em banco** com cookie opaco e revogável, cache curto (≈5 min) em cookie assinado, expiração absoluta de 7 dias e por inatividade.

## Consequências
Revogar passa a ter efeito imediato. Custo: uma leitura de sessão por requisição fora do cache.
