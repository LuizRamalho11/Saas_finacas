# ADR-013 — Política de vulnerabilidades em dependências

- **Status:** Aceita
- **Data:** 2026-09-12
- **Referência:** `docs/PLANO_SAAS_FINORA.md`, T0.6

## Contexto
Quando o CI passou a rodar `npm audit --audit-level=high`, a base já tinha 5 falhas altas,
nenhuma no código do projeto: `postcss` fixado dentro do Next 15.5, e `mysql2` e
`deepmerge-ts` dentro do CLI do Prisma 7. O `npm audit fix` propunha subir para o Next 16
ou voltar para o Prisma 6 — as duas coisas fora do escopo da Fase 0 e com risco alto.

## Decisão
Corrigir por `overrides` no `package.json`, forçando as versões já corrigidas
(`postcss`, `mysql2`, `deepmerge-ts`) sem mexer nas versões do Next e do Prisma. O job de
segurança do CI reprova com qualquer falha alta: **nenhuma exceção fica aberta**.
Se algum dia um override quebrar a biblioteca que o consome, a saída é registrar a exceção
aqui, com prazo de validade, em vez de afrouxar o audit inteiro.

## Consequências
`npm audit --audit-level=high` fecha em zero. Cada override é uma versão a mais para
acompanhar: quando o Next e o Prisma subirem suas dependências, os overrides devem ser
removidos. Verificado que o Prisma continua funcionando com `deepmerge-ts` 8
(`prisma generate`, `migrate deploy` e a suíte de integração).
