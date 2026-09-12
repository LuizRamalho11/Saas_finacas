# CLAUDE.md — Finora

SaaS de análise financeira B2B. Este arquivo traz as regras permanentes do projeto.
O roadmap completo está em **`docs/PLANO_SAAS_FINORA.md`** — leia as seções 1, 2 e 3 antes de qualquer tarefa.

## Stack
Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind 3 + Radix (padrão shadcn/ui) · Recharts
Prisma 7 (driver adapter `pg`) · PostgreSQL · Auth.js v5 (migração para Better Auth prevista — ADR-001) · Zod 4

## Comandos
| Comando | Uso |
| --- | --- |
| `npm run db:local` | Sobe o PostgreSQL embarcado (porta 55432). Deixe rodando em outro terminal. |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Usuário demo + ~1.650 lançamentos |
| `npm run dev` | http://localhost:3000 |
| `npm run build` | `prisma generate` + build de produção |
| `npx tsc --noEmit` | Typecheck (vira `npm run typecheck` na T0.3) |

Ainda **não existem** (criados na Fase 0): `npm run lint` funcional, `typecheck`, `test`, `e2e`, CI.

## Mapa do código
- `auth.ts`, `middleware.ts`, `lib/auth/*` — autenticação, guard `requireUser()`, sessões e histórico
- `lib/actions/*` — mutações (Server Actions) · `lib/api.ts` — consultas analíticas
- `lib/validation.ts` — schemas Zod e `ActionResult` · `prisma/schema.prisma` — modelo de dados
- `app/(app)/*` — rotas autenticadas · `components/*` — UI (primitivas em `components/ui`)

## Regras não negociáveis
1. Toda query de negócio filtra pelo dono (`userId`; depois `organizationId`). Edição/exclusão usam `{ id, ownerId }` no `where`.
2. Tudo exportado de arquivo `"use server"` é endpoint público: autenticar, autorizar e validar **todos** os parâmetros com Zod, com limites numéricos.
3. Nenhum segredo no código ou no git. Variáveis de ambiente só via `lib/env.ts` (após T0.4).
4. Nunca editar migration já aplicada. Migration destrutiva exige migration de dados separada, backup e confirmação do Luiz.
5. Tarefa só termina com typecheck, lint, testes e build verdes.
6. Um commit por tarefa, Conventional Commits com o ID (`fix(security): T1.3 bloqueia open redirect`).
7. Correção de segurança sempre acompanha um teste que falharia antes dela.
8. Consulte a documentação oficial atual das bibliotecas antes de usar APIs (Better Auth, Next, Prisma, Zod mudam).
9. Código e identificadores em inglês; interface, mensagens e docs em pt-BR.
10. Leveza: justificar cada dependência nova; preferir código só de servidor; carregar pesados sob demanda.

## Fluxo de trabalho
- Uma fase do plano por sessão, na ordem. Ao concluir uma tarefa, marque `- [x]` no plano com a data.
- Decisão fora das ADRs → pare e pergunte. Decisão nova ou alterada → registre em `docs/adr/`.
- Mudança de comportamento ou setup → atualize `README.md` e `CHANGELOG.md`.

## Ambiente de demonstração
Login do seed: `luiza.andrade@finora.app` / `finora2026`. Nunca usar essas credenciais fora de dev (ver T1.7).
