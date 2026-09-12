# ADR-004 — E-mail transacional

- **Status:** Aceita
- **Data:** 2026-09-11
- **Referência:** `docs/PLANO_SAAS_FINORA.md`, seção 3

## Contexto
Cadastro, recuperação de senha, convites e alertas dependem de e-mail.

## Decisão
**Resend + React Email** atrás de uma interface `Mailer`; em dev/test um adaptador que imprime no console e guarda as mensagens para os testes.

## Consequências
Troca de provedor sem mexer nos fluxos. Custo: domínio com SPF/DKIM configurados em produção.
