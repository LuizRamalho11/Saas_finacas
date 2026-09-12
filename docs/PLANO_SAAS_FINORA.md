# Finora — Plano de Profissionalização do SaaS

> **Documento de execução para o Claude Code.**
> Base: análise do código em `exemplo_saas/` (Next.js 15.5 · React 19 · Prisma 7 · Auth.js v5 beta.32 · Zod 4 · PostgreSQL), feita em 11/09/2026.
> Objetivo: levar o Finora de "demo muito bem feita" para **SaaS B2B multiempresa, seguro, auditável, leve e agradável de usar**.

---

## 0. Como usar este documento

**Para o Luiz**

1. Coloque este arquivo em `docs/PLANO_SAAS_FINORA.md` dentro do projeto (já está lá se veio pelo Cowork).
2. Abra o Claude Code na raiz do projeto e use os **prompts prontos da seção 8**, uma fase por vez.
3. Ao fim de cada fase, revise o PR/commit, rode o app e só então libere a próxima.

**Para o Claude Code**

- Este arquivo é a **fonte de verdade** do roadmap. Leia a seção 1 (regras) e a seção 2 (diagnóstico) antes de qualquer tarefa.
- Execute **uma fase por sessão**, na ordem. Dentro da fase, siga a ordem das tarefas (há dependências).
- Ao concluir uma tarefa, marque o checkbox `- [x]` dela aqui e registre a data. Se decidir algo diferente do plano, registre em `docs/adr/` e atualize este arquivo.
- Se uma tarefa exigir decisão de negócio não coberta pelas ADRs (seção 3), **pare e pergunte** em vez de adivinhar.

---

## 1. Regras de execução (não negociáveis)

1. **Nunca enfraquecer garantias existentes.** Toda query de dado de negócio continua filtrada pelo dono (hoje `userId`, depois `organizationId`). Edição/exclusão continuam usando `{ id, ownerId }` no filtro.
2. **Toda Server Action é um endpoint público.** Tudo que é exportado de um arquivo `"use server"` pode ser chamado por qualquer um via POST. Portanto: autenticação + autorização + validação Zod de **todos** os parâmetros + limites numéricos, sempre.
3. **Nada de segredo no código ou no git.** Segredos só em variáveis de ambiente validadas em `lib/env.ts`.
4. **Migrations são versionadas e reversíveis na prática.** Nunca editar migration já aplicada. Migrations destrutivas (drop de coluna/tabela, mudança de tipo) exigem: migration de dados separada, backup documentado e confirmação do Luiz.
5. **Cada tarefa termina verde:** `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` sem erros. Tarefas de UI também passam no E2E correspondente.
6. **Commits pequenos, um por tarefa**, no padrão Conventional Commits (`feat(auth): ...`, `fix(security): ...`, `chore(ci): ...`), citando o ID da tarefa (ex.: `T1.3`).
7. **Testes junto com o código.** Toda correção de segurança ganha um teste que falharia antes da correção.
8. **Consultar a documentação oficial atual** de cada biblioteca antes de usá-la (APIs de Better Auth, Next.js, Prisma e Zod mudam entre versões). Não confiar em memória para assinaturas de API.
9. **Idioma:** código e identificadores em inglês; textos de interface, mensagens de erro e documentação em português do Brasil.
10. **Leveza é requisito.** Antes de adicionar uma dependência, verificar se ela é realmente necessária, seu tamanho no bundle do cliente e se roda só no servidor.

---

## 2. Diagnóstico do estado atual

### 2.1 O que já está bom (preservar)

- Isolamento por dono em todas as queries; `updateMany/deleteMany` com `{ id, userId }` (IDOR bem tratado).
- Reconferência de posse de `categoryId`/`accountId` vindos do cliente (`assertOwnership`).
- `requireUser()` nunca carrega `passwordHash` (select explícito).
- Mensagem de login genérica; tentativas falhas registradas em `LoginHistory` inclusive para e-mail inexistente.
- Valores monetários em `Decimal` no banco; agregações analíticas em SQL parametrizado (`$queryRaw` com template tag, sem concatenação).
- Formato único de retorno das actions (`ActionResult`), Zod nos formulários, exclusão com confirmação + desfazer.
- Design system por tokens CSS, tema claro/escuro, responsividade em 3 faixas, cuidado real com acessibilidade.
- Dependências de auth atualizadas: `next-auth 5.0.0-beta.32` já inclui as correções do boletim de segurança de julho/2026.

### 2.2 Achados (o que precisa mudar)

Severidade: **C** = crítica · **A** = alta · **M** = média · **B** = baixa.

| ID | Sev. | Onde | Problema | Corrigido em |
|---|---|---|---|---|
| F01 | C | `lib/auth/guard.ts:22` | `requireUser()` não consulta `Session.revokedAt`/`expiresAt`. Logout e "Encerrar outras sessões" **não invalidam** o JWT (válido por 30 dias, `auth.ts:16`). Um cookie roubado continua funcionando. | T1.2 → Fase 2 |
| F02 | C | `components/auth/login-form.tsx:17,42` | **Open redirect**: `redirectTo` da URL vai direto para `router.replace()`. `?redirectTo=//site-malicioso.com` leva o usuário para fora após o login (phishing). | T1.3 |
| F03 | C | `auth.ts` / `lib/actions/auth.ts` | Sem rate limit nem bloqueio progressivo: força bruta ilimitada no login; cada tentativa custa um bcrypt (vetor de DoS de CPU). | T1.4 |
| F04 | A | `auth.ts:30-37` | **Enumeração por tempo**: e-mail inexistente responde sem rodar bcrypt, logo mais rápido que senha errada. | T1.4 |
| F05 | A | `lib/api.ts:519,609,640` · `lib/actions/auth.ts:57` | Parâmetros de Server Actions sem validação/limite: `getTransactions({ pageSize })`, `getMonthlySeries(months)`, `getRecentTransactions(limit)`, `getLoginHistory(limit)` aceitam qualquer número → extração em massa e DoS. Filtros (`period`, `status`, `type`…) não passam por Zod. | T1.1 |
| F06 | A | `lib/actions/transactions.ts:301` | `confirmImport` confia no payload do cliente: `amountValue`, `description`, `date`, `type`, `status` não são revalidados; tipo × categoria não é reconferido; sem limite de linhas; sem deduplicação (importar o mesmo CSV duas vezes duplica tudo). | T1.6, T4.7 |
| F07 | A | `lib/actions/transactions.ts:358` | **CSV/Formula injection** na exportação: descrição começando com `=`, `+`, `-`, `@` vira fórmula ao abrir no Excel. | T1.6 |
| F08 | A | `next.config.mjs` | Sem cabeçalhos de segurança (CSP, HSTS, `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`); `X-Powered-By` exposto. | T1.5, T5.1 |
| F09 | A | `lib/actions/auth.ts:108` | Troca de e-mail sem confirmar a senha atual e sem verificar o novo endereço → sequestro de conta a partir de uma sessão roubada. | T2.6 |
| F10 | A | `login-form.tsx:12` · `prisma/seed.ts` | Credenciais de demonstração pré-preenchidas no formulário e usuário seed com senha conhecida, sem distinção entre ambientes. | T1.7 |
| F11 | A | `auth.ts:10` · `login-form.tsx:81` | Senha mínima de 6 caracteres, sem política; não existe troca de senha; "Esqueci minha senha" é um botão sem ação; **não existe cadastro**. | Fase 2 |
| F12 | A | `prisma/schema.prisma` | Produto é B2B, mas os dados pertencem a um usuário. `role` e `company` são texto livre no `User`. Não há organização, convites nem papéis/permissões. | Fase 3 |
| F13 | A | `lib/actions/transactions.ts` | Exclusão física; "desfazer" recria o registro com **novo id** e perde `createdAt`. Não há `AuditLog`, nem autor (`createdById`/`updatedById`). A tela de login promete "Trilha de auditoria" que não existe. | Fase 4 |
| F14 | M | `prisma/schema.prisma:124` | `Transaction.account` com `onDelete: Cascade` contradiz a regra "nunca apagar lançamentos em cascata" — a proteção existe só na aplicação. | T1.8 |
| F15 | M | `prisma/schema.prisma` | Enums guardados como `String` (`type`, `status`, `Account.type`) sem `CHECK` no banco. Precisões diferentes: `Transaction.amount Decimal(12,2)` × `Account.openingBalance Decimal(14,2)`. | T1.8 |
| F16 | M | `lib/api.ts:35` e afins | Dinheiro convertido para `Number` e somado em JS (`sum`, `num`) — risco de erro de arredondamento em totais. | T1.8 |
| F17 | M | `lib/auth/session-log.ts:9-11` | IP extraído do **primeiro** valor de `x-forwarded-for`, que o cliente controla. Histórico de acesso e rate limit por IP ficam falsificáveis. | T1.4 |
| F18 | M | `auth.ts:18` | `trustHost: true` fixo no código em vez de vir do ambiente. | T0.4 |
| F19 | M | raiz | Projeto **não é repositório git**; sem ESLint instalado (o script `lint` não funciona), sem testes, sem CI, sem validação de variáveis de ambiente. | Fase 0 |
| F20 | M | `app/(app)/*/page.tsx` | Páginas são Client Components que buscam dados chamando várias Server Actions. O Next despacha Server Actions **uma de cada vez** no cliente → o dashboard faz ~7 chamadas em fila (lento), e as actions ficam expostas como API de leitura. | Fase 7 |
| F21 | B | `components/layout/topbar.tsx:83` · `reports/page.tsx` | Notificações fixas ("3 não lidas"); "Exportar" e "Gerar PDF" dos relatórios são simulações; preferência "resumo semanal" existe só no `localStorage`. | Fase 6 |
| F22 | B | geral | Sem logs estruturados, monitoramento de erros, health check, backup documentado, política de privacidade/LGPD. | Fase 5, Fase 8 |

---

## 3. Decisões de arquitetura (ADRs)

Cada ADR tem uma **escolha padrão**. O Claude Code segue o padrão, a menos que o Luiz tenha registrado outra escolha. Criar um arquivo curto por ADR em `docs/adr/NNN-titulo.md` na Fase 0.

| ADR | Decisão | Padrão escolhido | Por quê | Alternativa |
|---|---|---|---|---|
| 001 | Biblioteca de autenticação | **Migrar para Better Auth** | O Auth.js passou a ser mantido pela equipe do Better Auth (set/2025), que recomenda Better Auth para projetos novos; o Auth.js v5 segue em beta, recebendo principalmente correções. O roadmap precisa exatamente do que o Better Auth traz pronto: e-mail/senha com verificação e reset, 2FA (TOTP + códigos de recuperação), passkeys, organizações com convites e papéis, sessões em banco revogáveis e rate limit. Com Auth.js + Credentials, tudo isso seria construído à mão. | Manter Auth.js e implementar manualmente (ver Apêndice E). |
| 002 | Modelo de sessão | **Sessão em banco** (cookie opaco, revogável), com cache curto em cookie assinado para performance | Resolve F01 na raiz: revogar = apagar a linha. | JWT curto (15 min) + refresh token rotativo. |
| 003 | Multi-tenancy | **Banco compartilhado, coluna `organizationId`** em todas as tabelas de negócio + checagem na camada de serviço; RLS do Postgres como defesa extra (opcional, Fase 5) | Simples, barato, padrão de mercado para SaaS B2B pequeno/médio. | Schema por tenant (complexo demais agora). |
| 004 | E-mail transacional | **Resend + React Email**, atrás de uma interface `Mailer`; em dev/test, adaptador que imprime no console | Boa entrega, templates em React, plano gratuito para começar. | SES, Postmark, SMTP. |
| 005 | Rate limit | Interface `RateLimiter`; **Upstash Redis** em produção, memória em dev/test; rotas de auth usam o limitador do Better Auth | Funciona em serverless (Vercel). | Tabela no Postgres. |
| 006 | Arquivos (comprovantes) | **Cloudflare R2** (compatível com S3) com URLs pré-assinadas; bucket privado | Sem custo de saída, API S3. | AWS S3, Supabase Storage. |
| 007 | Observabilidade | **pino** (logs JSON com redação de campos sensíveis) + **Sentry** (erros e performance) | Padrão, barato, integra com Next. | OpenTelemetry + Grafana. |
| 008 | Testes | **Vitest** (unitário/integração com Postgres real via `embedded-postgres`, que o projeto já usa) + **Playwright** (E2E + axe para acessibilidade) | Rápido e sem Docker. | Jest. |
| 009 | Hospedagem | **Vercel (região `gru1`) + Postgres gerenciado em São Paulo** (Neon ou Supabase, `sa-east-1`) com pooler | Latência baixa no Brasil e dados no país (facilita LGPD). | Railway, Fly.io, VPS. |
| 010 | Camada de ações | **Wrapper próprio `defineAction`** (auth + permissão + Zod + rate limit + auditoria + mapeamento de erro) e **camada de serviços** em `lib/services/` | Centraliza segurança; actions ficam finas e testáveis. | `next-safe-action`. |
| 011 | Leitura de dados | **Server Components + Suspense** para páginas; Server Actions só para mutações; leituras interativas via Route Handlers `GET` validados | Resolve F20; menos JS no cliente. | React Query sobre Route Handlers. |
| 012 | Cobrança (Fase 8) | **Decidir com o Luiz**: Stripe (cartão + Pix) ou Asaas/Mercado Pago (boleto, Pix, NF) | Depende do público-alvo. | — |

---

## 4. Visão geral do roadmap

| Fase | Tema | Resultado | Depende de | Esforço relativo |
|---|---|---|---|---|
| 0 | Fundação | git, lint, testes, CI, env validado, docs | — | P |
| 1 | Correções críticas de segurança | F01–F08, F10, F14–F17 resolvidos na base atual | 0 | M |
| 2 | Identidade completa | cadastro, verificação de e-mail, recuperação e troca de senha, 2FA, passkeys, sessões revogáveis, alertas | 1 | G |
| 3 | Multiempresa e permissões | organizações, convites, papéis, troca de empresa, dados por `organizationId` | 2 | G |
| 4 | Registro completo de transações | auditoria imutável, soft delete, autoria, versionamento, transferências, recorrência, parcelas, anexos, conciliação, fechamento de período | 3 | G |
| 5 | Cibersegurança avançada e LGPD | CSP com nonce, varredura em CI, criptografia de campos, logs e alertas de segurança, exportação/exclusão de dados, RLS opcional | 4 | M |
| 6 | Experiência e produtividade | onboarding, paleta de comandos, ações em lote, regras de categorização, orçamentos, notificações reais, exportações reais | 4 | G |
| 7 | Performance e leveza | RSC + Suspense, cache por tags, carregamento sob demanda, orçamento de performance | 3 (pode correr junto com 6) | M |
| 8 | Produção e negócio | ambientes, deploy, backups, planos e cobrança, painel administrativo, status e suporte | 5 | G |

P = pequeno (1–2 sessões) · M = médio (3–5) · G = grande (6+).

**Marco "pronto para primeiros clientes":** Fases 0 → 5 concluídas + T8.1 a T8.4.

---

## 5. Fases detalhadas

Formato de cada tarefa: **Por quê** · **Arquivos** · **Passos** · **Aceite** · **Testes**.

---

### FASE 0 — Fundação

#### - [x] T0.1 — Versionamento com git *(feito em 12/09/2026)*
- **Por quê:** F19. Sem git não há histórico, revisão nem rollback.
- **Passos:** `git init`; revisar `.gitignore` (manter `.env`, `.postgres`, `.next`, `node_modules`; adicionar `coverage/`, `playwright-report/`, `test-results/`); **conferir que `.env` não entra no primeiro commit**; commit inicial `chore: estado inicial do Finora`. Criar branch `main` e trabalhar em branches `fase-N/...`.
- **Aceite:** `git status` limpo; `git log` com commit inicial; `git ls-files | grep .env` retorna só `.env.example`.

#### - [x] T0.2 — CLAUDE.md do projeto *(feito em 11/09/2026)*
- **Por quê:** dar ao Claude Code as regras permanentes sem repetir em todo prompt.
- **Arquivos:** `CLAUDE.md` (raiz).
- **Passos:** resumir a stack, os comandos (`dev`, `db:local`, `db:migrate`, `test`, `e2e`, `lint`, `typecheck`), as regras da seção 1 deste plano e o link para este arquivo.
- **Aceite:** arquivo com no máximo ~80 linhas, objetivo.

#### - [x] T0.3 — Lint, formatação e typecheck *(feito em 12/09/2026)*
- **Passos:** instalar ESLint 9 com config flat do Next (`eslint-config-next`) + `typescript-eslint`, `eslint-plugin-security` e regra `no-restricted-imports` impedindo importar `@/lib/prisma` em arquivos `"use client"`; Prettier + `prettier-plugin-tailwindcss`; scripts `lint`, `format`, `typecheck` (`tsc --noEmit`). Opcional: `husky` + `lint-staged` no pre-commit.
- **Aceite:** `npm run lint` e `npm run typecheck` passam sem erros (corrigir o que aparecer).

#### - [x] T0.4 — Variáveis de ambiente validadas *(feito em 12/09/2026)*
- **Por quê:** F18; falhar cedo com mensagem clara.
- **Arquivos:** `lib/env.ts`, `.env.example`, `auth.ts`.
- **Passos:** schema Zod separando `server` e `client` (`NEXT_PUBLIC_*`); validar na inicialização; `AUTH_TRUST_HOST` e `APP_URL` vindos do ambiente; nunca acessar `process.env` fora de `lib/env.ts`. Documentar cada variável no `.env.example`.
- **Aceite:** remover `DATABASE_URL` faz o servidor falhar na partida com mensagem legível; `grep -r "process.env" --include=*.ts* app lib components` só encontra `lib/env.ts`.

#### - [x] T0.5 — Infraestrutura de testes *(feito em 12/09/2026)*
- **Arquivos:** `vitest.config.ts`, `tests/setup/db.ts`, `tests/factories/*`, `playwright.config.ts`, `e2e/*`.
- **Passos:**
  1. Vitest com dois projetos: `unit` (sem banco) e `integration` (sobe `embedded-postgres` numa porta própria, roda `prisma migrate deploy`, trunca tabelas entre testes).
  2. Factories para usuário, conta, categoria, transação.
  3. Playwright com servidor de dev apontando para banco de teste; helper de login.
  4. Primeiros testes: `parseAmount`, schemas Zod, isolamento entre dois usuários em `getTransaction`/`updateTransaction`/`deleteTransaction`, E2E de login/logout.
- **Aceite:** `npm test` e `npm run e2e` rodam do zero numa máquina limpa.

#### - [x] T0.6 — CI no GitHub Actions *(feito em 12/09/2026; falta abrir o PR de verificação)*
- **Arquivos:** `.github/workflows/ci.yml`, `.github/dependabot.yml`.
- **Passos:** jobs `lint`, `typecheck`, `test` (unit + integration), `build`, `e2e` (pode ser só no PR para `main`), `npm audit --audit-level=high`, **gitleaks** (varredura de segredos). Dependabot semanal para npm e GitHub Actions. Cache de `node_modules`.
- **Aceite:** PR de teste mostra todos os checks verdes.

#### - [x] T0.7 — Registro de decisões *(feito em 11/09/2026)*
- **Passos:** criar `docs/adr/` com as ADRs 001–011 da seção 3 (1 parágrafo cada: contexto, decisão, consequências) e `CHANGELOG.md`.

---

### FASE 1 — Correções críticas de segurança (na base atual)

> Objetivo: fechar as brechas **antes** de construir em cima. Ainda com Auth.js; a Fase 2 migra a autenticação.

#### - [x] T1.1 — `defineAction`: wrapper seguro para Server Actions *(feito em 12/09/2026)*
- **Por quê:** F05. Centralizar autenticação, validação, limites e tratamento de erro.
- **Arquivos:** `lib/server/action.ts`, `lib/server/errors.ts`, todos os arquivos em `lib/actions/` e `lib/api.ts`.
- **Passos:**
  1. Criar `defineAction({ name, input: zodSchema, auth: "required" | "public", rateLimit?, handler })` que: resolve o usuário, valida **todos** os argumentos com Zod, aplica rate limit (T1.4), gera `requestId`, captura erros conhecidos (`AppError` com código → mensagem pt-BR) e desconhecidos (log + mensagem genérica), retorna `ActionResult`.
  2. Criar schemas para parâmetros de leitura: `period` (enum), `page` (int ≥ 1), `pageSize` (int 1–100), `months` (1–36), `limit` (1–50), ids como `z.cuid()` (ou `z.string().min(1).max(40)`).
  3. Migrar **todas** as funções exportadas de `lib/api.ts` e `lib/actions/*` para `defineAction`.
  4. Remover os `describeError` duplicados.
- **Aceite:** nenhuma função exportada de arquivo `"use server"` fica fora do wrapper (criar um teste que importa os módulos e verifica isso, ou regra de lint).
- **Testes:** chamar `getTransactions({ pageSize: 1_000_000 })` retorna erro de validação; `getMonthlySeries(10_000)` idem.

#### - [x] T1.2 — Sessão revogada deixa de valer (correção imediata) *(feito em 12/09/2026)*
- **Por quê:** F01.
- **Arquivos:** `lib/auth/guard.ts`, `auth.ts`.
- **Passos:** em `requireUser()`, buscar a `Session` do `sessionId` do token e rejeitar se não existir, se `revokedAt` estiver preenchido ou se `expiresAt` já passou. Reduzir `maxAge` do JWT para 7 dias e adicionar expiração por inatividade (ex.: 12 h sem uso → `revokedAt`), atualizando um `lastSeenAt` no máximo 1×/5 min. Ao revogar, a próxima requisição cai em `/api/session/expired`.
- **Aceite:** após "Encerrar outras sessões", o navegador B é deslogado na próxima ação; após logout, reutilizar o cookie antigo não funciona.
- **Testes:** integração simulando token com sessão revogada → `NAO_AUTENTICADO`.

#### - [x] T1.3 — Fechar o open redirect *(feito em 12/09/2026)*
- **Por quê:** F02.
- **Arquivos:** `lib/safe-redirect.ts`, `components/auth/login-form.tsx`, `middleware.ts`.
- **Passos:** função `safeRedirect(target, fallback = "/dashboard")` que aceita apenas caminhos relativos começando com uma única `/`, sem `//`, sem `\`, sem esquema, e pertencentes a uma lista de prefixos internos. Usar no formulário e onde mais houver redirecionamento por parâmetro.
- **Testes:** unitários com `//evil.com`, `/\evil.com`, `https://evil.com`, `javascript:alert(1)`, `/%2F%2Fevil.com` → todos caem no fallback; `/transactions?x=1` passa.

#### - [x] T1.4 — Rate limit, bloqueio progressivo e tempo constante no login *(feito em 12/09/2026)*
- **Por quê:** F03, F04, F17.
- **Arquivos:** `lib/server/rate-limit.ts`, `lib/server/client-ip.ts`, `auth.ts`, `lib/actions/auth.ts`.
- **Passos:**
  1. `RateLimiter` com adaptadores memória (dev/test) e Upstash (prod) — ADR-005.
  2. Limites: login 5/min por IP e 10/15 min por e-mail; após 10 falhas seguidas por e-mail, bloqueio temporário crescente (15 min, 1 h, 24 h) com campos `failedLoginCount` e `lockedUntil` no `User`.
  3. Tempo constante: quando o usuário não existe, comparar a senha contra um hash bcrypt fixo ("dummy hash") para igualar o tempo de resposta.
  4. `client-ip.ts`: obter IP de forma confiável conforme o provedor (na Vercel, `x-real-ip`/`x-vercel-forwarded-for`; atrás de proxy próprio, o **último** salto confiável). Configurável por env `TRUSTED_PROXY`.
  5. Mensagem ao usuário continua genérica; quando bloqueado, informar "Muitas tentativas. Tente novamente em alguns minutos."
- **Aceite / Testes:** 6ª tentativa em 1 min retorna 429/erro de limite; diferença de tempo médio entre "e-mail inexistente" e "senha errada" < 20 % em 50 amostras (teste de integração tolerante).

#### - [x] T1.5 — Cabeçalhos de segurança (primeira versão) *(feito em 12/09/2026)*
- **Por quê:** F08.
- **Arquivos:** `next.config.mjs`.
- **Passos:** `poweredByHeader: false`; `headers()` com `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (só em produção), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`. CSP completa com nonce fica na T5.1; aqui, uma CSP inicial em modo `Content-Security-Policy-Report-Only`.
- **Aceite:** `curl -I` mostra os cabeçalhos; nenhuma quebra visual (tema, gráficos).

#### - [x] T1.6 — Importação e exportação de CSV blindadas *(feito em 12/09/2026; deduplicação fica na T4.7, como previsto)*
- **Por quê:** F06, F07.
- **Arquivos:** `lib/actions/transactions.ts`, `lib/csv.ts`.
- **Passos:**
  1. `confirmImport` recebe só as linhas brutas + um `previewToken`; **refaz toda a validação no servidor** (mesma função do preview) e grava só o que passar. Alternativa: o preview grava um `ImportBatch` pendente no servidor e a confirmação referencia o id do lote.
  2. Limite de 5.000 linhas e 2 MB por importação (`serverActions.bodySizeLimit` explícito no `next.config`).
  3. Gravação em `prisma.$transaction` (tudo ou nada).
  4. Exportação: função `csvCell()` que escapa aspas **e** prefixa com `'` valores que começam com `=`, `+`, `-`, `@`, tab ou CR; incluir BOM UTF-8 para acentos no Excel.
- **Testes:** payload com `amountValue: -999` ou `type` trocado é rejeitado; exportar descrição `=HYPERLINK("x")` sai como `'=HYPERLINK("x")`.

#### - [x] T1.7 — Separar demonstração de produção *(feito em 12/09/2026)*
- **Por quê:** F10.
- **Passos:** `APP_MODE=demo|production` em `lib/env.ts`; credenciais pré-preenchidas e o texto "Ambiente de demonstração" só em `demo`; o seed se recusa a rodar com `NODE_ENV=production` sem flag explícita `--force-demo`; senha do usuário demo vem de env.
- **Aceite:** em `production`, o formulário abre vazio e o seed aborta.

#### - [ ] T1.8 — Integridade de dados no banco
- **Por quê:** F14, F15, F16.
- **Arquivos:** `prisma/schema.prisma`, nova migration, `lib/money.ts`, `lib/api.ts`.
- **Passos:**
  1. `Transaction.account` → `onDelete: Restrict` (a realocação já é feita pela aplicação).
  2. Converter `type`, `status`, `Account.type` em `enum` do Prisma (migration com `USING` para converter os valores existentes).
  3. Padronizar dinheiro em `Decimal(14,2)`; `CHECK (amount > 0)` via SQL na migration.
  4. `lib/money.ts` com operações em `Prisma.Decimal` (somar, subtrair, formatar); totais calculados em SQL ou com Decimal; `Number` apenas na borda (gráficos).
- **Aceite:** migration aplica limpa sobre o banco com seed; totais do dashboard idênticos antes/depois.

---

### FASE 2 — Identidade completa (cadastro, login e conta)

> Implementa a ADR-001 (Better Auth). Critérios de aceite valem independentemente da biblioteca.

#### - [ ] T2.1 — Migração para Better Auth sem perder usuários
- **Arquivos:** `lib/auth/server.ts` (instância), `lib/auth/client.ts`, `app/api/auth/[...all]/route.ts`, `prisma/schema.prisma`, `scripts/migrate-auth.ts`, `middleware.ts`, `lib/auth/guard.ts`.
- **Passos:**
  1. Ler a documentação atual do Better Auth (instalação Next.js App Router, adaptador Prisma, plugin `nextCookies`).
  2. Gerar as tabelas do Better Auth (user, session, account, verification) e **mapear para os modelos existentes** quando possível (`User`). A tabela `Session` atual é substituída pela do Better Auth; `LoginHistory` vira `SecurityEvent` (T2.9).
  3. Senhas existentes são bcrypt: configurar `password.verify` para aceitar hashes `$2a/$2b` (bcrypt) **e** o algoritmo padrão do Better Auth; ao logar com hash bcrypt válido, re-hashear no algoritmo novo (migração transparente).
  4. Script `migrate-auth.ts` idempotente que cria as linhas de credencial a partir de `User.passwordHash`.
  5. Sessão em banco (ADR-002) com `expiresIn` 7 dias, `updateAge` 1 dia e cache em cookie de 5 min.
  6. `requireUser()` passa a usar `auth.api.getSession({ headers })`; a assinatura pública de `requireUser` não muda para não quebrar o resto.
  7. Middleware continua só de conveniência (presença de cookie), com o nome do cookie novo.
  8. Remover `next-auth`, `types/next-auth.d.ts` e `app/api/auth/[...nextauth]`.
- **Aceite:** usuário do seed entra com a senha antiga; revogar sessão tem efeito imediato; todos os testes das Fases 0–1 continuam verdes.

#### - [ ] T2.2 — Política de senha
- **Passos:** mínimo 10 caracteres, máximo 128; sem exigir símbolos, mas bloquear senhas vazadas (plugin `haveIBeenPwned` do Better Auth ou consulta k-anonymity à API Pwned Passwords) e senhas contendo o e-mail/nome; medidor de força no cliente (`@zxcvbn-ts/core`, carregado sob demanda).
- **Aceite:** `password123` e `finora2026` são recusadas com mensagem clara.

#### - [ ] T2.3 — Cadastro (sign-up) com verificação de e-mail
- **Arquivos:** `app/(auth)/signup/page.tsx`, `components/auth/signup-form.tsx`, `lib/mail/*`, `emails/verify-email.tsx`.
- **Passos:**
  1. Reorganizar rotas públicas em `app/(auth)/` (`login`, `signup`, `forgot-password`, `reset-password`, `verify-email`, `two-factor`).
  2. Formulário: nome, e-mail, senha (com medidor), nome da empresa, aceite de Termos e Política de Privacidade (link + data/versão do aceite gravadas).
  3. Proteção anti-bot: Cloudflare Turnstile no cadastro (e no login após 3 falhas).
  4. Envio de e-mail de verificação (ADR-004); link expira em 24 h, uso único, token guardado **como hash**.
  5. Sem e-mail verificado: acesso bloqueado a dados, tela "confira seu e-mail" com reenvio (limitado a 3/h).
  6. Resposta de cadastro não revela se o e-mail já existe (mensagem: "Se o e-mail puder ser usado, você receberá um link").
  7. Após verificar: criar organização (Fase 3) e levar ao onboarding (T6.1). Até a Fase 3 existir, criar contas e categorias padrão para o usuário.
- **Testes:** E2E completo cadastro → e-mail (capturado pelo adaptador de teste) → verificação → dashboard.

#### - [ ] T2.4 — Recuperação de senha
- **Passos:** "Esqueci minha senha" → e-mail com link de 30 min, uso único, token em hash; resposta sempre igual exista ou não o e-mail; ao redefinir: revogar **todas** as sessões, registrar evento, enviar e-mail "sua senha foi alterada".
- **Aceite:** link usado duas vezes falha na segunda; sessões antigas caem.

#### - [ ] T2.5 — Troca de senha logado
- **Arquivos:** `app/(app)/settings/security/`.
- **Passos:** exige senha atual; opção "encerrar outras sessões" marcada por padrão; e-mail de aviso.

#### - [ ] T2.6 — Troca de e-mail segura
- **Por quê:** F09.
- **Passos:** exige senha atual (ou 2FA); envia confirmação ao **novo** e-mail; só troca após clique; envia aviso ao **antigo** e-mail com link "não fui eu" que bloqueia a troca e força redefinição de senha.

#### - [ ] T2.7 — Autenticação em dois fatores (2FA)
- **Passos:** plugin `twoFactor`: TOTP (QR code + chave manual), 10 códigos de recuperação exibidos uma única vez e guardados em hash, "confiar neste dispositivo por 30 dias"; segredo TOTP **criptografado** em repouso (T5.4). Tela de desafio no login. Desativar 2FA exige senha + código. Dono/admin de organização pode exigir 2FA de todos os membros (Fase 3).
- **Testes:** E2E ativando 2FA com gerador TOTP no teste (`otpauth`), login pedindo código, uso de código de recuperação.

#### - [ ] T2.8 — Passkeys e login social (opcional nesta fase)
- **Passos:** passkeys (WebAuthn) como alternativa sem senha; Google OAuth com vinculação de conta só se o e-mail do provedor for verificado.

#### - [ ] T2.9 — Central de segurança da conta
- **Arquivos:** `SecurityEvent` (substitui `LoginHistory`), `components/settings/security-panel.tsx`.
- **Passos:**
  1. `SecurityEvent { id, userId?, email, type, ip, userAgent, geo? (país/cidade aproximados), metadata Json, createdAt }` com tipos: `login_success`, `login_failed`, `logout`, `password_changed`, `password_reset_requested`, `email_changed`, `2fa_enabled`, `2fa_disabled`, `session_revoked`, `account_locked`.
  2. Painel com **sessões ativas reais** (dispositivo, local aproximado, último acesso) e botão "encerrar" por sessão, além de "encerrar todas as outras".
  3. E-mail de alerta em login de **novo dispositivo/local**.
- **Aceite:** encerrar uma sessão específica derruba só aquele navegador.

#### - [ ] T2.10 — Step-up (reautenticação) para ações sensíveis
- **Passos:** helper `requireRecentAuth(minutes = 10)`; exigido para: trocar e-mail/senha, desativar 2FA, exportar todos os dados, excluir conta/organização, alterar papéis, gerar chave de API.

---

### FASE 3 — Multiempresa e permissões (B2B de verdade)

#### - [ ] T3.1 — Modelo de organização
- **Arquivos:** `prisma/schema.prisma` (ver Apêndice B), plugin `organization` do Better Auth.
- **Passos:** `Organization { id, name, slug, document? (CNPJ), currency, timezone, fiscalYearStart, plan, require2fa, createdAt }`, `Member { organizationId, userId, role }`, `Invitation { email, role, token(hash), expiresAt, invitedById, status }`. Mover `company`, `currency`, `timezone` do `User` para a organização (o `User` mantém só preferências pessoais). `role` do `User` (texto livre) vira "cargo" opcional, sem valor de permissão.

#### - [ ] T3.2 — Papéis e matriz de permissões
- **Passos:** papéis `owner`, `admin`, `editor` (financeiro), `viewer`, `accountant` (leitura + exportação + fechamento de período). Permissões por recurso/ação (Apêndice A) definidas **em um único arquivo** `lib/auth/permissions.ts`, usado no servidor (autorização) e no cliente (esconder botões — nunca como única barreira).

#### - [ ] T3.3 — Migração dos dados para `organizationId`
- **Passos:**
  1. Migration 1 (aditiva): `organizationId` **nullable** em `Account`, `Category`, `Transaction` + `createdById`.
  2. Script de dados: para cada usuário existente, criar uma organização (nome = `company` atual), `Member` como `owner`, preencher `organizationId` e `createdById = userId`.
  3. Migration 2: `organizationId` `NOT NULL`, índices `(organizationId, date)`, `(organizationId, categoryId)`, `(organizationId, accountId)`, `(organizationId, status)`; uniques `(organizationId, name)`.
  4. `userId` de negócio sai das tabelas na Migration 3, só depois que tudo usar `organizationId` (manter `createdById`).
- **Aceite:** totais do dashboard do usuário seed idênticos antes/depois.

#### - [ ] T3.4 — Guard de organização e camada de serviços
- **Arquivos:** `lib/auth/guard.ts`, `lib/services/*.ts`, `lib/server/action.ts`.
- **Passos:** `requireMember(permission)` → `{ user, org, role }` a partir de `activeOrganizationId` da sessão; `defineAction` ganha `permission: "transaction:create"` etc.; lógica de negócio sai de `lib/actions/*` para `lib/services/*`, que recebem `ctx` e **sempre** filtram por `ctx.org.id`.
- **Testes (suíte de isolamento):** para cada action, criar dados na org A e tentar ler/editar/excluir estando logado na org B → sempre "não encontrado". Para cada papel, verificar a matriz do Apêndice A.

#### - [ ] T3.5 — Convites e gestão de membros
- **Arquivos:** `app/(app)/settings/members/`.
- **Passos:** convidar por e-mail com papel; link de 7 dias, uso único; aceitar exige login/cadastro com o **mesmo e-mail**; reenviar/cancelar convite; alterar papel; remover membro (revoga sessões naquela org); não permitir remover o último `owner`; transferir propriedade.

#### - [ ] T3.6 — Troca de empresa
- **Passos:** seletor de organização no topo (sidebar/topbar); URL opcionalmente com slug (`/o/[slug]/dashboard`) para links compartilháveis; cache e revalidação sempre por organização.

---

### FASE 4 — Registro completo de transações (livro-razão auditável)

#### - [ ] T4.1 — Trilha de auditoria imutável
- **Por quê:** F13. Requisito central de um produto financeiro.
- **Arquivos:** `AuditLog` no schema, `lib/services/audit.ts`, migration com trigger.
- **Passos:**
  1. `AuditLog { id, organizationId, actorId, actorType (user|system|api), action, entityType, entityId, before Json?, after Json?, diff Json?, ip, userAgent, requestId, createdAt, prevHash, hash }`.
  2. Gravar **na mesma transação de banco** da mutação (`prisma.$transaction`), a partir da camada de serviços — nunca só no cliente.
  3. Catálogo de ações no Apêndice C.
  4. Imutabilidade: trigger `BEFORE UPDATE OR DELETE ON "AuditLog"` que lança exceção; usuário do banco da aplicação sem permissão de `DELETE` nessa tabela (documentar para produção).
  5. Evidência de adulteração: `hash = sha256(prevHash + JSON canônico do evento)` encadeado por organização; script `verify-audit-chain.ts`.
- **Aceite:** tentar `UPDATE` direto no `AuditLog` falha; alterar um valor à mão quebra a verificação da cadeia.

#### - [ ] T4.2 — Autoria, versionamento e exclusão lógica
- **Passos:** `createdById`, `updatedById`, `deletedAt`, `deletedById`, `version Int` em `Transaction` (e em `Account`/`Category`); toda listagem filtra `deletedAt: null`; **lixeira** por 30 dias com restauração (mesmo id — substitui o "desfazer" que recriava registro); expurgo definitivo por job agendado, com evento de auditoria. Bloqueio otimista: update envia `version`; se mudou, retorna conflito "Este lançamento foi alterado por Fulano às 14:32 — recarregar?".

#### - [ ] T4.3 — Histórico visível na interface
- **Arquivos:** `components/transactions/transaction-detail.tsx`, `app/(app)/audit/page.tsx`.
- **Passos:** aba "Histórico" no detalhe do lançamento (linha do tempo: quem, quando, o que mudou — "valor: R$ 1.200,00 → R$ 1.250,00"); página **Auditoria** (admin/owner/accountant) com filtros por pessoa, ação, entidade e período + exportação.

#### - [ ] T4.4 — Transferências entre contas
- **Passos:** tipo `transfer` que gera dois lançamentos ligados por `transferGroupId` (saída na origem, entrada no destino), criados/editados/excluídos juntos; transferências **não** contam como receita/despesa nos KPIs.

#### - [ ] T4.5 — Recorrências e parcelamentos
- **Passos:** `RecurringRule { frequency (daily|weekly|monthly|yearly), interval, dayOfMonth, startDate, endDate?, occurrences?, template Json }`; job diário (Vercel Cron) gera os lançamentos futuros como `pending` com horizonte de 90 dias; editar "só este" / "este e os próximos". Parcelamento: `installmentGroupId`, `installmentNumber`, `installmentTotal` ("3/10"), com ajuste de centavos na última parcela.

#### - [ ] T4.6 — Anexos (comprovantes e notas)
- **Passos:** upload direto para R2 (ADR-006) por URL pré-assinada de 5 min; tipos permitidos por **conteúdo** (magic bytes), não só extensão: PDF, PNG, JPG, WEBP, XML (NF-e); máximo 10 MB; chave `org/{orgId}/tx/{txId}/{uuid}`; download por URL pré-assinada de 60 s após checar permissão; `Attachment { id, organizationId, transactionId, key, filename, mime, size, sha256, uploadedById }`; pré-visualização na gaveta do lançamento.

#### - [ ] T4.7 — Importação profissional (CSV e OFX) com deduplicação
- **Passos:** `ImportBatch { id, organizationId, source (csv|ofx), filename, rowCount, importedCount, status, createdById }`; cada lançamento importado guarda `importBatchId` e `fingerprint` (hash de conta + data + valor + descrição normalizada, ou `FITID` do OFX) com unique `(organizationId, fingerprint)`; linhas já existentes aparecem no preview como "duplicadas" (desmarcadas); desfazer uma importação inteira pelo lote; mapeamento de colunas salvo por modelo de banco.

#### - [ ] T4.8 — Conciliação bancária
- **Passos:** status `reconciled` + `reconciledAt/reconciledById`; tela de conciliação lado a lado (extrato importado × lançamentos) com sugestão de pares por valor/data (±3 dias); saldo conciliado × saldo contábil por conta.

#### - [ ] T4.9 — Fechamento de período
- **Passos:** `PeriodLock { organizationId, month, lockedById, lockedAt }`; lançamentos em mês fechado não podem ser criados/editados/excluídos (erro claro); reabrir exige papel `owner`/`accountant` + motivo, registrado na auditoria.

#### - [ ] T4.10 — Etiquetas, centros de custo e campos úteis
- **Passos:** `Tag` N:N com transações; `costCenter` opcional; `dueDate` × `paidAt` (competência × caixa) para contas a pagar/receber, com visão "vencendo nos próximos 7 dias" e "atrasados".

---

### FASE 5 — Cibersegurança avançada e LGPD

#### - [ ] T5.1 — CSP com nonce (modo bloqueante)
- **Passos:** gerar nonce por requisição no middleware e aplicar em `script-src 'self' 'nonce-…' 'strict-dynamic'`; passar o nonce ao `ThemeProvider` do `next-themes`; `style-src 'self' 'unsafe-inline'` (necessário para estilos inline dos gráficos) ; `img-src 'self' data: blob: <domínio R2>`; `connect-src 'self' <Sentry> <Upstash>`; `frame-ancestors 'none'`; `form-action 'self'`; `base-uri 'self'`; `object-src 'none'`; endpoint `report-to`. Rodar 1 semana em Report-Only, corrigir violações, então bloquear.
- **Aceite:** nota A no securityheaders.com; nenhuma violação no console nas rotas principais.

#### - [ ] T5.2 — Varredura de segurança contínua
- **Passos:** CodeQL (GitHub) e Semgrep (regras `p/typescript`, `p/nextjs`, `p/owasp-top-ten`) no CI; OWASP ZAP baseline contra o preview de cada PR para `main`; `npm audit` bloqueando `high`/`critical`; checklist OWASP ASVS nível 2 em `docs/security/asvs-checklist.md` (Apêndice D) revisado a cada fase.

#### - [ ] T5.3 — Logs estruturados, monitoramento e alertas
- **Passos:** `pino` com `redact` para `password`, `token`, `authorization`, `cookie`, `totpSecret`, números de documento; `requestId` gerado no middleware (`x-request-id`) e propagado; Sentry com remoção de dados pessoais (`sendDefaultPii: false`, `beforeSend` filtrando); `/api/health` (ping no banco, sem detalhes internos); alertas: pico de `login_failed`, conta bloqueada, erro 5xx acima de limiar, falha de job agendado.

#### - [ ] T5.4 — Criptografia de campos sensíveis
- **Passos:** `lib/server/crypto.ts` com AES-256-GCM (chave de 32 bytes em `ENCRYPTION_KEY`, suporte a rotação por `keyId` no valor cifrado); aplicar a segredos TOTP, tokens de integrações futuras e documentos (CNPJ/CPF, se armazenados). Nunca logar valores decifrados.

#### - [ ] T5.5 — Proteções complementares
- **Passos:** confirmar a checagem de origem das Server Actions do Next (não abrir `allowedOrigins` sem necessidade); cookies `HttpOnly`, `Secure`, `SameSite=Lax`, prefixo `__Host-` em produção; limite de tamanho de corpo; timeouts de queries (`statement_timeout` no Postgres para o usuário da aplicação); usuário de banco com privilégio mínimo (sem `DROP`, sem superusuário) e usuário separado para migrations; dependências fixadas por lockfile e `npm ci` no CI.

#### - [ ] T5.6 — Row Level Security (defesa em profundidade, opcional)
- **Passos:** políticas RLS por `organizationId` nas tabelas de negócio; extensão do Prisma que executa cada operação dentro de `$transaction` com `set_config('app.current_org', orgId, true)`; testes provando que uma query sem contexto retorna zero linhas. Avaliar custo de performance antes de ativar em produção.

#### - [ ] T5.7 — LGPD (privacidade)
- **Passos:**
  1. Páginas `/privacidade` e `/termos` versionadas; registro do aceite (versão + data) por usuário.
  2. **Exportar meus dados**: job que gera um ZIP (JSON + CSV) do usuário/organização, disponível por link temporário e com aviso por e-mail.
  3. **Excluir minha conta/organização**: step-up (T2.10), período de carência de 30 dias com cancelamento, depois exclusão definitiva; logs de auditoria preservados com o ator **anonimizado** (base legal: cumprimento de obrigação/exercício de direitos — validar com advogado).
  4. Política de retenção: `SecurityEvent` 12 meses, lixeira 30 dias, backups 30 dias (valores configuráveis, documentados).
  5. Sem cookies não essenciais → sem banner; se entrar analytics, adicionar consentimento antes.
  6. `docs/security/incident-response.md`: como detectar, conter, comunicar clientes e ANPD, e registrar incidentes.

---

### FASE 6 — Experiência, produtividade e acabamento profissional

#### - [ ] T6.1 — Onboarding guiado
- **Passos:** após o primeiro acesso: (1) dados da empresa, (2) primeira conta bancária com saldo inicial, (3) modelo de categorias por segmento (Serviços, Comércio, Restaurante/Alimentação, Indústria, Personalizado), (4) importar extrato ou criar primeiro lançamento, (5) convidar equipe. Checklist "Primeiros passos" no dashboard até completar. Dados de exemplo opcionais, removíveis com um clique.

#### - [ ] T6.2 — Paleta de comandos e atalhos
- **Passos:** `cmdk` com `Ctrl/⌘ + K`: navegar, buscar lançamentos, criar lançamento, trocar empresa, alternar tema. Atalhos: `N` novo lançamento, `/` foco na busca, `G D` dashboard, `G T` transações, `?` lista de atalhos. Carregar sob demanda.

#### - [ ] T6.3 — Lançamento rápido e produtividade no extrato
- **Passos:** campo "lançamento rápido" que entende `Aluguel 3.500 ontem #Imóvel` (valor, data relativa, categoria por `#`); seleção múltipla com ações em lote (categorizar, mudar status, mover de conta, excluir — tudo auditado); duplicar lançamento; edição inline de categoria/status; filtros sincronizados com a URL (`nuqs`) e **visões salvas**; paginação por cursor e rolagem virtualizada para listas grandes.

#### - [ ] T6.4 — Regras de categorização automática
- **Passos:** `Rule { conditions (descrição contém / contraparte é / valor entre), actions (definir categoria, conta, tag) , priority }`; aplicar na criação e na importação; sugerir criar regra quando o usuário recategoriza o mesmo tipo de lançamento 3 vezes.

#### - [ ] T6.5 — Orçamentos e metas
- **Passos:** `Budget { organizationId, categoryId, month, amount }` com cópia do mês anterior; barra de consumo por categoria no dashboard; alertas em 80 % e 100 % (notificação + e-mail opcional). Substitui a "meta derivada" atual por meta configurável, mantendo a derivada como sugestão.

#### - [ ] T6.6 — Notificações reais
- **Por quê:** F21.
- **Passos:** `Notification { userId, organizationId, type, title, body, link, readAt }`; sino da topbar com contagem real e "marcar todas como lidas"; preferências por tipo e canal (app / e-mail) **no banco** (fim do `localStorage` para isso); resumo semanal por e-mail via Vercel Cron (segunda, 8h no fuso da organização).

#### - [ ] T6.7 — Exportações e relatórios reais
- **Passos:** CSV (T1.6), **XLSX** (`exceljs`, no servidor, com formatação de moeda e totais) e **PDF** (`@react-pdf/renderer`, no servidor) do extrato e dos relatórios mensal/anual com a identidade visual do Finora; relatórios grandes gerados em segundo plano com aviso quando prontos; DRE simplificada por categoria.

#### - [ ] T6.8 — Acabamento
- **Passos:** estados vazios com ação principal em toda tela; `error.tsx` por seção (um gráfico com erro não derruba a página); confirmações destrutivas padronizadas; mensagens de erro acionáveis; página de perfil com avatar (upload R2); "Novidades" (changelog in-app); central de ajuda com links contextuais; PWA instalável (manifest + ícones); auditoria de acessibilidade automática (`@axe-core/playwright`) nas rotas principais sem violações sérias.

---

### FASE 7 — Performance e leveza

#### - [ ] T7.1 — Páginas como Server Components
- **Por quê:** F20.
- **Passos:** converter `dashboard`, `transactions`, `cash-flow`, `reports` para Server Components que buscam dados **em paralelo no servidor** (`Promise.all` + `<Suspense>` por card, com os skeletons existentes como fallback); período e filtros passam para `searchParams`; componentes interativos (gráficos, formulários) continuam client, recebendo dados por props; leituras de `lib/api.ts` deixam de ser Server Actions e viram funções `server-only` chamadas pelos Server Components (Route Handlers `GET` validados quando o cliente precisar buscar).
- **Aceite:** o dashboard faz uma única ida ao servidor por navegação; nenhuma leitura exportada como Server Action.

#### - [ ] T7.2 — Cache e revalidação por organização
- **Passos:** `unstable_cache`/`"use cache"` (conforme a versão do Next) nas agregações com tags `org:{id}:transactions`, `org:{id}:accounts`; mutações chamam `revalidateTag` só das tags afetadas (no lugar de `revalidatePath` em 4 rotas).

#### - [ ] T7.3 — Menos JavaScript no cliente
- **Passos:** `@next/bundle-analyzer`; `recharts`, `cmdk`, `zxcvbn`, importador e exportadores carregados com `next/dynamic`; `optimizePackageImports` para `lucide-react` e Radix; meta: JS da primeira carga do dashboard < 200 kB gzip.

#### - [ ] T7.4 — Banco preparado para volume
- **Passos:** revisar índices com `EXPLAIN ANALYZE` nas queries do dashboard sobre 100 mil lançamentos (seed de carga); tabela de resumo `DailySummary (organizationId, date, accountId, categoryId, income, expense)` atualizada na mesma transação das mutações, se as agregações passarem de 150 ms; pooler de conexões em produção.

#### - [ ] T7.5 — Orçamento de performance no CI
- **Passos:** Lighthouse CI nas rotas `/login` e `/dashboard` (autenticado): LCP < 2,5 s, CLS < 0,1, INP < 200 ms, Performance ≥ 90; falha o PR se piorar.

---

### FASE 8 — Produção e negócio

#### - [ ] T8.1 — Ambientes e deploy
- **Passos:** `development` / `preview` (por PR, banco branch) / `production`; Vercel `gru1` + Postgres em São Paulo (ADR-009); `prisma migrate deploy` no pipeline **antes** do deploy da aplicação, com backup/snapshot imediatamente antes; domínio próprio com HTTPS e HSTS preload.

#### - [ ] T8.2 — Backups e recuperação
- **Passos:** PITR (recuperação a um ponto no tempo) habilitado; teste de restauração **mensal** documentado em `docs/runbooks/restore.md` (o backup só vale se a restauração foi testada); RPO ≤ 1 h, RTO ≤ 4 h.

#### - [ ] T8.3 — Runbooks e status
- **Passos:** `docs/runbooks/` (deploy, rollback, restauração, incidente de segurança, rotação de segredos); página de status pública e monitoramento de disponibilidade (ex.: Better Stack/UptimeRobot) em `/api/health`.

#### - [ ] T8.4 — Painel administrativo interno
- **Passos:** área `/admin` só para `superadmin` (flag no usuário, 2FA obrigatório): lista de organizações, uso, plano, bloqueio de conta; **personificação** (impersonation) com motivo obrigatório, banner visível, tempo limitado e registro na auditoria da organização afetada.

#### - [ ] T8.5 — Planos, limites e cobrança
- **Passos:** decidir o provedor (ADR-012); planos (ex.: Grátis / Pro / Empresa) com limites por organização (membros, contas, lançamentos/mês, anexos em GB, 2FA obrigatório, auditoria avançada); período de teste; webhooks idempotentes e verificados por assinatura; tela de assinatura e faturas; bloqueio suave (somente leitura) em inadimplência, nunca perda de dados.

#### - [ ] T8.6 — API pública e integrações (futuro)
- **Passos:** chaves de API por organização (hash no banco, prefixo visível, escopos, expiração, última utilização), rate limit por chave, webhooks de saída assinados (HMAC), documentação OpenAPI.

---

## 6. Definição de pronto

### 6.1 Para cada tarefa
- [ ] Critérios de aceite atendidos e demonstráveis.
- [ ] Testes novos cobrindo o comportamento (e o ataque, quando for segurança).
- [ ] `typecheck`, `lint`, `test`, `build` verdes; E2E verde quando houver UI.
- [ ] Nenhum `console.log` esquecido, nenhum segredo, nenhum `any` sem justificativa.
- [ ] Textos de interface em pt-BR, acessíveis (rótulo, foco, contraste).
- [ ] README/ADR/CHANGELOG atualizados quando mudar comportamento ou setup.
- [ ] Checkbox marcado neste documento.

### 6.2 Checklist de release (antes de ter clientes)
- [ ] Todos os achados C e A da seção 2.2 resolvidos.
- [ ] Suíte de isolamento entre organizações e matriz de papéis 100 % verde.
- [ ] CSP bloqueante, headers nota A, ZAP baseline sem alertas altos.
- [ ] 2FA disponível; obrigatório para superadmin.
- [ ] Backup restaurado com sucesso pelo menos uma vez.
- [ ] Páginas de Termos e Privacidade publicadas; fluxo de exportação e exclusão de dados funcionando.
- [ ] Monitoramento de erros e alertas de segurança ativos.

---

## 7. Riscos e cuidados

| Risco | Mitigação |
|---|---|
| Migração de auth derrubar logins | Hash bcrypt aceito + re-hash transparente (T2.1); testar com cópia do banco; manter plano de rollback (branch + backup). |
| Migração para `organizationId` corromper totais | Migrações em 3 etapas (aditiva → dados → restritiva) e teste comparando totais antes/depois. |
| CSP quebrar tema/gráficos | Report-Only por uma semana antes de bloquear. |
| Excesso de dependências deixar o app pesado | Regra 10 da seção 1 + bundle analyzer + orçamento no CI. |
| Escopo grande demais | Marco "pronto para primeiros clientes" (seção 4); Fases 6–8 podem ser priorizadas pelo que os primeiros clientes pedirem. |

---

## 8. Prompts prontos para o Claude Code

**Prompt de abertura (use em toda sessão nova):**

```
Leia CLAUDE.md e docs/PLANO_SAAS_FINORA.md (seções 1, 2 e 3 completas).
Vamos executar a FASE <N>. Antes de alterar código:
1. Liste as tarefas da fase, o que você entendeu de cada uma e a ordem.
2. Aponte qualquer conflito entre o plano e o código atual.
3. Espere meu "ok".
Depois, execute tarefa por tarefa: implemente, escreva os testes, rode
typecheck/lint/test/build, faça um commit por tarefa (Conventional Commits
com o ID da tarefa) e marque o checkbox no plano. Pare e me pergunte se
precisar de uma decisão de negócio que não esteja nas ADRs.
```

**Prompt de retomada:**

```
Continue a FASE <N> do docs/PLANO_SAAS_FINORA.md a partir da primeira tarefa
sem checkbox marcado. Rode os testes antes de começar para garantir que a
base está verde.
```

**Prompt de revisão ao fim de cada fase:**

```
Revise tudo o que foi feito na FASE <N> como um revisor de segurança sênior:
compare com os critérios de aceite do plano, procure brechas de autorização
(IDOR entre organizações), validação faltando, segredos, regressões de
performance e acessibilidade. Liste os problemas por severidade e corrija
os críticos e altos.
```

---

## Apêndice A — Matriz de permissões

| Recurso · ação | owner | admin | editor | accountant | viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| Ver dashboard, relatórios, extrato | ✓ | ✓ | ✓ | ✓ | ✓ |
| Criar/editar lançamentos | ✓ | ✓ | ✓ | — | — |
| Excluir lançamentos (lixeira) | ✓ | ✓ | ✓ | — | — |
| Importar extratos | ✓ | ✓ | ✓ | — | — |
| Exportar dados | ✓ | ✓ | ✓ | ✓ | — |
| Contas e categorias (gerir) | ✓ | ✓ | — | — | — |
| Orçamentos e regras | ✓ | ✓ | ✓ | — | — |
| Conciliação | ✓ | ✓ | ✓ | ✓ | — |
| Fechar/reabrir período | ✓ | — | — | ✓ | — |
| Ver auditoria | ✓ | ✓ | — | ✓ | — |
| Membros e convites | ✓ | ✓ | — | — | — |
| Alterar papéis (exceto owner) | ✓ | ✓ | — | — | — |
| Exigir 2FA da organização | ✓ | ✓ | — | — | — |
| Cobrança e plano | ✓ | — | — | — | — |
| Excluir organização / transferir propriedade | ✓ | — | — | — | — |

Implementar como `can(role, "transaction:create")` a partir de um único objeto em `lib/auth/permissions.ts`.

---

## Apêndice B — Modelo de dados alvo (esboço)

> Esboço para orientar; nomes finais das tabelas de auth seguem o que o Better Auth gerar. Todas as tabelas de negócio têm `organizationId` e índices começando por ele.

```prisma
enum TxType   { income expense transfer }
enum TxStatus { pending completed canceled reconciled }
enum Role     { owner admin editor accountant viewer }

model Organization {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  document        String?  // CNPJ, cifrado (T5.4)
  currency        String   @default("BRL")
  timezone        String   @default("America/Sao_Paulo")
  require2fa      Boolean  @default(false)
  plan            String   @default("free")
  createdAt       DateTime @default(now())
  deletedAt       DateTime?
  members         Member[]
  // accounts, categories, transactions, auditLogs, ...
}

model Member {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  role           Role
  createdAt      DateTime @default(now())
  @@unique([organizationId, userId])
}

model Transaction {
  id                 String    @id @default(cuid())
  organizationId     String
  accountId          String
  categoryId         String?   // null em transferências
  type               TxType
  status             TxStatus  @default(completed)
  amount             Decimal   @db.Decimal(14, 2)   // CHECK (amount > 0)
  date               DateTime  @db.Date
  dueDate            DateTime? @db.Date
  paidAt             DateTime?
  description        String
  counterparty       String?
  method             String?
  notes              String?
  costCenter         String?
  transferGroupId    String?
  recurringRuleId    String?
  installmentGroupId String?
  installmentNumber  Int?
  installmentTotal   Int?
  importBatchId      String?
  fingerprint        String?
  reconciledAt       DateTime?
  reconciledById     String?
  version            Int       @default(1)
  createdById        String
  updatedById        String?
  deletedAt          DateTime?
  deletedById        String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  @@unique([organizationId, fingerprint])
  @@index([organizationId, date])
  @@index([organizationId, categoryId])
  @@index([organizationId, accountId])
  @@index([organizationId, status])
  @@index([organizationId, deletedAt])
}

model AuditLog {
  id             String   @id @default(cuid())
  organizationId String
  actorId        String?
  actorType      String   // user | system | api
  action         String   // ver Apêndice C
  entityType     String
  entityId       String
  before         Json?
  after          Json?
  diff           Json?
  ip             String?
  userAgent      String?
  requestId      String?
  prevHash       String?
  hash           String
  createdAt      DateTime @default(now())
  @@index([organizationId, createdAt])
  @@index([organizationId, entityType, entityId])
}

// Também: Invitation, SecurityEvent, Attachment, ImportBatch, RecurringRule,
// Tag/TransactionTag, Rule, Budget, PeriodLock, Notification, SavedView, ApiKey.
```

---

## Apêndice C — Catálogo de eventos de auditoria

| Domínio | Ações |
|---|---|
| Lançamentos | `transaction.created`, `.updated`, `.deleted`, `.restored`, `.purged`, `.bulk_updated`, `.reconciled`, `.unreconciled` |
| Transferências | `transfer.created`, `.updated`, `.deleted` |
| Importação | `import.previewed`, `.confirmed`, `.reverted` |
| Anexos | `attachment.uploaded`, `.downloaded`, `.deleted` |
| Contas/Categorias | `account.created/.updated/.archived/.deleted`, `category.created/.updated/.deleted`, `*.reassigned` |
| Período | `period.locked`, `period.unlocked` |
| Organização | `org.updated`, `org.2fa_required_changed`, `member.invited/.joined/.role_changed/.removed`, `ownership.transferred` |
| Dados | `export.requested`, `export.downloaded`, `org.deletion_requested`, `org.deletion_canceled` |
| Admin | `admin.impersonation_started`, `admin.impersonation_ended` |

Eventos de **conta pessoal** (login, senha, 2FA) vão para `SecurityEvent` (T2.9), não para `AuditLog`.

---

## Apêndice D — Checklist de segurança (resumo OWASP)

| Tema | Verificação | Tarefa |
|---|---|---|
| Controle de acesso | Toda leitura/escrita filtra por organização; suíte de IDOR; matriz de papéis testada | T3.4 |
| Autenticação | Rate limit, bloqueio, tempo constante, senha forte, 2FA, sessões revogáveis, step-up | T1.4, Fase 2 |
| Sessão | Cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`; expiração absoluta e por inatividade | T2.1, T5.5 |
| Validação | Zod em todas as entradas de actions/handlers, com limites | T1.1 |
| Injeção | SQL só parametrizado; CSV injection tratada; nada de `dangerouslySetInnerHTML` com dado de usuário | T1.6 |
| XSS/Clickjacking | CSP com nonce, `frame-ancestors 'none'` | T5.1 |
| Redirecionamento | `safeRedirect` em todo parâmetro de destino | T1.3 |
| Criptografia | TLS/HSTS; AES-256-GCM em campos sensíveis; tokens guardados como hash | T1.5, T5.4 |
| Uploads | Tipo por magic bytes, tamanho, bucket privado, URL pré-assinada curta | T4.6 |
| Registro e monitoramento | Auditoria imutável, eventos de segurança, logs com redação, alertas | T4.1, T2.9, T5.3 |
| Dependências | Dependabot, `npm audit`, CodeQL, Semgrep, gitleaks | T0.6, T5.2 |
| Configuração | Env validado, headers, usuário de banco com privilégio mínimo, modo demo isolado | T0.4, T1.5, T1.7, T5.5 |
| Continuidade | PITR, restauração testada, runbooks | T8.2, T8.3 |

---

## Apêndice E — Se decidir manter o Auth.js (alternativa à ADR-001)

Construir manualmente, com o mesmo nível de exigência:

1. Sessão validada no banco a cada requisição (T1.2 já cobre) e rotação de token.
2. Tabelas `VerificationToken` e `PasswordResetToken` (token aleatório de 32 bytes, **armazenado como SHA-256**, expiração, uso único).
3. Fluxos de cadastro, verificação, reset e troca de e-mail como Server Actions com `defineAction` e rate limit.
4. 2FA com `otpauth` (TOTP), segredo cifrado (T5.4), códigos de recuperação em hash.
5. Organizações, membros e convites modelados à mão (Apêndice B) e `activeOrganizationId` guardado na sessão.
6. Passkeys com `@simplewebauthn/server`.

Custo estimado: 2–3× o esforço da Fase 2 e da parte de auth da Fase 3.
