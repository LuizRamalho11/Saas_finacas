# ADR-011 — Leitura de dados

- **Status:** Aceita
- **Data:** 2026-09-11
- **Referência:** `docs/PLANO_SAAS_FINORA.md`, seção 3

## Contexto
Páginas client buscam dados por várias Server Actions, que o Next despacha uma de cada vez (achado F20).

## Decisão
Páginas como **Server Components + Suspense**; Server Actions só para mutações; Route Handlers `GET` validados quando o cliente precisar buscar.

## Consequências
Menos idas ao servidor e menos JavaScript no cliente. Custo: refatoração das 4 páginas principais (Fase 7).
