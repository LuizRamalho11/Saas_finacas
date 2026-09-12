# ADR-006 — Armazenamento de arquivos

- **Status:** Aceita
- **Data:** 2026-09-11
- **Referência:** `docs/PLANO_SAAS_FINORA.md`, seção 3

## Contexto
Comprovantes e notas fiscais serão anexados aos lançamentos (T4.6).

## Decisão
**Cloudflare R2** (API S3), bucket privado, upload e download por URL pré-assinada de curta duração após checar permissão.

## Consequências
Sem custo de saída de dados; arquivos nunca públicos.
