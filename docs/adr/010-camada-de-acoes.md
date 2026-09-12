# ADR-010 — Camada de ações e serviços

- **Status:** Aceita
- **Data:** 2026-09-11
- **Referência:** `docs/PLANO_SAAS_FINORA.md`, seção 3

## Contexto
Cada Server Action repete autenticação e tratamento de erro, e parâmetros de leitura não são validados (achado F05).

## Decisão
Wrapper próprio **`defineAction`** (auth, permissão, Zod, rate limit, auditoria, erros) e regras de negócio em **`lib/services/`**.

## Refinamento (12/09/2026, T1.1)
O wrapper ficou em três formas, porque as telas consomem dois contratos diferentes:
`defineAction` (mutações, devolve `ActionResult` para o formulário mostrar erro de campo),
`defineQuery` (leituras, devolve o dado e lança `AppError`) e `definePublicAction` (login e
logout, que rodam sem sessão). Todas marcam a função com um símbolo, e um teste de
integração reprova se algum arquivo `"use server"` exportar função fora do wrapper.

## Consequências
Segurança centralizada; actions finas e serviços testáveis isoladamente.
