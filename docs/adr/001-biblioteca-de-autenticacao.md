# ADR-001 — Biblioteca de autenticação

- **Status:** Aceita
- **Data:** 2026-09-11
- **Referência:** `docs/PLANO_SAAS_FINORA.md`, seção 3

## Contexto
O projeto usa Auth.js v5 (beta) com provider de credenciais e JWT. O roadmap exige cadastro, verificação de e-mail, recuperação de senha, 2FA, passkeys, organizações com convites e papéis, sessões revogáveis e rate limit. Desde setembro/2025 o Auth.js é mantido pela equipe do Better Auth, que recomenda Better Auth para projetos novos.

## Decisão
Migrar para **Better Auth** na Fase 2 (T2.1), aceitando os hashes bcrypt atuais e re-hasheando no primeiro login.

## Consequências
Recursos de identidade prontos e mantidos; menos código próprio de segurança. Custo: migração de tabelas de sessão e testes de regressão do login. Alternativa documentada no Apêndice E do plano (manter Auth.js e construir à mão, 2–3× o esforço).
