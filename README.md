# Finora — SaaS de análise financeira (demonstração)

SaaS de análise financeira B2B com CRUD completo de transações, autenticação por
credenciais e persistência em PostgreSQL. Tema escuro como padrão, tema claro
disponível, todos os indicadores calculados a partir dos lançamentos reais do banco.


## Como rodar do zero

Não é preciso Docker nem instalar PostgreSQL: o pacote `embedded-postgres` traz
os binários e sobe um servidor real na porta 55432, com os dados em `.postgres/`.

```bash
npm install
cp .env.example .env        # ajuste DATABASE_URL se for usar Neon/Supabase/outro
npm run db:local            # sobe o PostgreSQL local (deixe rodando neste terminal)

# em outro terminal:
npm run db:migrate          # aplica as migrations
npm run db:seed             # popula 18 meses de lançamentos
npm run dev                 # http://localhost:3000
```

Login do seed: **luiza.andrade@finora.app** / **finora2026**

### Variáveis de ambiente

| Variável | Obrigatória | Para que serve |
| --- | --- | --- |
| `DATABASE_URL` | sim | Conexão PostgreSQL. Aponte para o banco local, Neon, Supabase ou qualquer Postgres gerenciado. |
| `AUTH_SECRET` | sim | Assinatura dos tokens de sessão. Gere com `openssl rand -base64 32`. |
| `AUTH_TRUST_HOST` | em dev/proxy | Deixa o Auth.js confiar no host da requisição (`true` ou `false`). |
| `APP_URL` | em produção | URL pública do app, usada em redirecionamentos e e-mails. Em dev, o padrão é `http://localhost:3000`. |

Todas são validadas por `lib/env.ts` quando o servidor sobe: se faltar ou
estiver malformada, o servidor não inicia e diz qual é o problema. Nenhum outro
arquivo da aplicação lê `process.env` — importe `env` de `lib/env.ts`.

### Scripts

| Comando | O que faz |
| --- | --- |
| `npm run db:local` | Sobe o PostgreSQL embarcado em `localhost:55432`. |
| `npm run db:migrate` | `prisma migrate dev` — cria e aplica migrations. |
| `npm run db:seed` | Recria o usuário demo e ~1.650 lançamentos (idempotente). |
| `npm run db:reset` | Derruba o schema, reaplica as migrations e roda o seed. |
| `npm run db:studio` | Abre o Prisma Studio para inspecionar as tabelas. |
| `npm run build` | `prisma generate` + build de produção. |
| `npm run lint` | ESLint 9 em todo o projeto; qualquer aviso reprova. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run format` | Formata com Prettier (`npm run format:check` só confere). |
| `npm test` | Vitest (unitários + integração com PostgreSQL de verdade). |
| `npm run e2e` | Playwright (ponta a ponta, com banco e servidor próprios). |

### Integração contínua

O workflow `.github/workflows/ci.yml` roda a cada push na `main` e em todo PR:
lint e formatação, typecheck, testes, build, ponta a ponta (só nos PRs),
`npm audit --audit-level=high` e varredura de segredos com gitleaks. O Dependabot
abre PRs semanais para npm e GitHub Actions.

### Testes

`npm test` roda dois projetos do Vitest: `unit` (sem banco) e `integration`,
que sobe um PostgreSQL embarcado na porta 55433, aplica as migrations e limpa
as tabelas entre os testes. `npm run e2e` sobe outro banco (55434) e um Next
próprio na porta 3100, com diretório de build separado — dá para rodar com o
`npm run dev` aberto. Nenhum dos dois encosta no banco de desenvolvimento.

Numa máquina nova, antes do primeiro `npm run e2e`:

```bash
npx playwright install chromium
```

**Usando um Postgres gerenciado:** troque só a `DATABASE_URL` no `.env` e rode
`npm run db:migrate && npm run db:seed`. Nada mais muda — nem código, nem
scripts, nem o `npm run db:local` precisa existir no seu fluxo.

## Modelo de dados

Seis entidades, todas isoladas por `userId`:

```
User ──┬── Account      (conta bancária, cartão, investimento)
       ├── Category     (income | expense, com cor usada nos gráficos)
       ├── Transaction  (Decimal(12,2), status pending|completed|canceled)
       ├── Session      (sessão da aplicação; o logout marca revokedAt)
       └── LoginHistory (acessos; sobrevive ao fim da sessão)
```

### Ajustes que fiz no schema proposto

- **`LoginHistory.userId` é opcional e existe um campo `email`.** O requisito
  pede registrar tentativas de login malsucedidas; com `userId` obrigatório,
  uma tentativa contra um e-mail inexistente não teria a quem se vincular e
  ficaria invisível — justamente o caso que mais interessa monitorar.
- **`Session` é mantida pela aplicação, não pelo NextAuth.** O provider de
  credenciais do Auth.js só funciona com `strategy: "jwt"` e nunca escreve em
  tabela de sessão. Em vez de deixar a tabela morta, o JWT carrega o `sessionId`
  e `LoginHistory.sessionId` aponta para ele — é assim que o logout consegue
  carimbar `logoutAt` na linha certa.
- **`Transaction.status` = `pending | completed | canceled`**, com os badges
  existentes atualizados para Pendente / Concluída / Cancelada.
- **Campos acrescentados**: `Account.institution` e `Account.openingBalance`
  (o saldo passa a ser derivado, não digitado), `Transaction.counterparty` e
  `Transaction.method` (já existiam na UI da etapa anterior),
  `Category.createdAt/updatedAt`, e `@@unique([userId, name])` em `Account`.
- **Índices** em `Transaction` por `categoryId`, `accountId` e `status`, que são
  exatamente os filtros da tela de extrato.
- **`bcryptjs` no lugar de `bcrypt`** — mesmo algoritmo, sem compilação nativa.

## Segurança

- Toda Server Action começa por `requireUser()`, que lê a sessão e devolve o
  usuário **sem `passwordHash`** (o `select` do Prisma nem traz a coluna).
- Nenhuma query roda sem `userId`. Edição e exclusão usam `updateMany`/
  `deleteMany` com `{ id, userId }` no filtro: um id de outro usuário
  simplesmente não casa e a operação afeta zero linhas.
- Ao criar ou editar uma transação, categoria e conta são reconferidas como
  pertencentes ao usuário — ids vindos do formulário não são confiáveis.
- Logins malsucedidos entram em `LoginHistory` com `success: false` e o motivo,
  e a mensagem devolvida à tela é sempre genérica ("E-mail ou senha incorretos"),
  sem revelar se o e-mail existe.
- O middleware apenas redireciona com base na *presença* do cookie — ele roda no
  Edge, onde o Prisma não carrega. A autorização real acontece no servidor, em
  `requireUser()`, antes de qualquer leitura ou escrita.

## Dados

`prisma/seed.ts` gera **1.653 transações** cobrindo 18 meses a partir de um PRNG
semeado: rodar o seed duas vezes produz exatamente os mesmos números. Já não
existe série sintética paralela — KPIs, gráficos e projeções são agregações SQL
das linhas reais, então criar ou excluir um lançamento move os indicadores na
hora. O modelo mantém a sazonalidade da etapa anterior (folha nos dias 5 e 20,
impostos no dia 20, pico no 4º trimestre) e fecha com margem de ~24%.

Lançamentos com status `canceled` aparecem no extrato, riscados, mas ficam fora
de toda métrica.

## Estrutura de pastas

```
prisma/
  schema.prisma           # User, Session, LoginHistory, Account, Category, Transaction
  migrations/             # migrations versionadas (prisma migrate dev)
  seed.ts                 # 18 meses de lançamentos, reprodutível
scripts/db-local.mjs      # PostgreSQL embarcado, sem Docker
auth.ts                   # Auth.js: provider de credenciais + callbacks do JWT
middleware.ts             # redirecionamento por presença de cookie (Edge)
app/
  layout.tsx              # tema, toasts e metadados globais
  globals.css             # design tokens (variáveis CSS) — clara e escura
  login/                  # autenticação real (bcrypt + JWT)
  api/auth/[...nextauth]/ # handlers do Auth.js
  api/session/expired/    # limpa cookie órfão e evita laço de redirecionamento
  (app)/                  # rotas autenticadas, compartilham a mesma moldura
    layout.tsx            #   → <AppShell>: sidebar + header + tab bar mobile
    error.tsx             #   tela de erro com "tentar novamente"
    dashboard/            #   KPIs, receita x despesa, medidores, categorias
    cash-flow/            #   realizado x projetado, contas, compromissos
    transactions/         #   extrato + CRUD; /import traz o assistente de CSV
    reports/              #   comparativo mês a mês e ano a ano
    settings/             #   perfil · categorias · contas · segurança
components/
  ui/                     # primitivas shadcn/ui (Radix + cva) + drawer, alert-dialog
  layout/                 # sidebar, topbar, drawer, tab bar, contexto de período
  charts/                 # área, barras, fluxo de caixa, gauge SVG, sparkline, skeleton
  dashboard/              # KpiCard, TransactionsTable, StatusBadge
  transactions/           # formulário, painel de detalhe, exclusão, importador CSV
  settings/               # gestores de categorias, contas e painel de segurança
  common/                 # Delta (↑/↓ %), EmptyState, SectionHeading
  providers.tsx           # tema (next-themes) + preferências + Toaster
lib/
  prisma.ts               # cliente Prisma com driver adapter (pg)
  api.ts                  # consultas analíticas (Server Actions)
  actions/                # mutações: transações, categorias, contas, auth
  auth/                   # guard de sessão e registro de login/logout
  validation.ts           # schemas Zod + parser de valores em pt-BR
  periods.ts, format.ts, palette.ts, use-async.ts
types/                    # contratos de domínio compartilhados
```

## Design tokens

Nenhum valor de cor é escrito direto no componente: tudo sai de variáveis CSS em
`app/globals.css`, então trocar de tema não duplica uma única classe.

| Token | Escuro | Claro | Uso |
| --- | --- | --- | --- |
| `--canvas` | `#0B111F` | `#F5F7FB` | fundo da aplicação |
| `--surface` | `#131A2B` | `#FFFFFF` | cards |
| `--surface-2` | `#1A2236` | `#EEF2F9` | hover, trilhos, elevação |
| `--border` | `#232C42` | `#DDE3EE` | divisórias |
| `--fg` / `--fg-muted` | `#E8EDF7` / `#94A3C4` | `#0F172A` / `#526080` | texto e labels |
| `--brand` | `#4F7DFF` | `#2563EB` | azul elétrico, ação primária |
| `--cyan` | `#22D3EE` | `#0E9BB8` | segunda série |
| `--violet` | `#8B5CF6` | `#7C3AED` | terceira série, projeção |
| `--coral` | `#FF8A5B` | `#F2600F` | despesas e alertas |
| `--success` / `--danger` | `#34D399` / `#FB7185` | `#188C63` / `#DC2743` | variações ↑ / ↓ |

Raio de card `1rem`, raio de controle `0.75rem`, sombra suave e `gap` de `1rem` na grade.
As séries dos gráficos usam `--chart-1..6`, sempre na mesma ordem em todas as páginas.

## Dados

`lib/data/dataset.ts` gera **548 dias** (18 meses) de receita e despesa com um PRNG
semeado — servidor e cliente produzem exatamente a mesma série, sem erro de hidratação.
O modelo combina tendência de crescimento composto, sazonalidade anual (pico no 4º
trimestre, vale em janeiro/fevereiro), efeito de dia da semana, folha quinzenal nos dias
5 e 20, impostos no dia 20 e contratos enterprise esporádicos. A margem líquida resultante
fica em torno de 21%.

São 6 categorias de despesa, 3 fontes de receita, 4 contas e ~90 lançamentos nos últimos
120 dias (incluindo alguns agendados para os próximos dias), com clientes e fornecedores
fictícios. O extrato é uma **amostra** de lançamentos relevantes, não o razão completo —
por isso seus totais acompanham a proporção da série agregada sem replicá-la centavo a centavo.


## Decisões desta etapa (CRUD e persistência)

- **Server Actions em vez de rotas de API.** Uma única abordagem em todo o
  projeto: os componentes cliente chamam funções assíncronas tipadas, sem
  `fetch` nem duplicação de tipos entre cliente e servidor. Toda action retorna
  o mesmo formato (`{ ok, data | error, fieldErrors }`), o que deixa os
  formulários uniformes.
- **KPIs recalculados de verdade.** Cada mutação incrementa uma "revisão" na
  página, que reconsulta os indicadores, e as actions chamam `revalidatePath`
  nas rotas afetadas. Criar um lançamento de R$ 250 mil move receita e lucro na
  mesma tela, sem recarregar.
- **Exclusão em duas etapas.** Diálogo de confirmação obrigatório e, depois,
  8 segundos de "Desfazer" no toast — a linha é recriada com os mesmos dados.
  A exclusão no banco é real; o desfazer insere de volta.
- **Categorias e contas nunca apagam transações em cascata.** Se houver
  lançamentos vinculados, a exclusão exige escolher um destino, e a realocação
  mais a exclusão acontecem dentro de uma transação de banco (tudo ou nada).
- **Cores de categoria como hex, validadas para os dois temas.** O schema pede
  hex, que por natureza não se adapta a claro/escuro; então a paleta oferecida
  no seletor foi escolhida com contraste ≥ 3:1 tanto sobre a superfície escura
  quanto sobre o branco.
- **Data do formulário no fuso do navegador.** As agregações rodam em UTC, mas
  os lançamentos são gravados ao meio-dia UTC — mesmo dia do calendário nos dois
  fusos. Sem isso, criar um lançamento às 22h em São Paulo sugeriria a data de
  amanhã.
- **Saldo de conta é derivado**, não digitado: saldo inicial mais todos os
  lançamentos não cancelados.
- **Importação de CSV em duas etapas.** O arquivo é lido no cliente, validado no
  servidor contra as categorias e contas reais do usuário, e nada é gravado
  antes da confirmação. Linhas problemáticas são listadas com o número da linha
  e o motivo. Aceita `;` ou `,`, campos entre aspas e valores em formato
  brasileiro (`1.234,56`).
- **Meta do mês agora é derivada** da média dos três meses anteriores com 8% de
  ambição, em vez de um número fixo no código.

## Verificações executadas

Além de `npx tsc --noEmit` e `npm run build` sem erros, o fluxo foi exercitado em
navegador headless contra o banco real:

| Verificação | Resultado |
| --- | --- |
| Login com as credenciais do seed | entra em `/dashboard`, KPIs vindos do banco |
| Rota protegida sem sessão | `307` para `/login?redirectTo=…` |
| Criar transação de R$ 42.500 | total 305 → 306; entradas sobem exatamente R$ 42.500 |
| Criar R$ 250.000 no dashboard | receita 3,4 → 3,7 mi; lucro +R$ 250.000 na hora |
| Editar valor pelo painel de detalhe | tabela passa a mostrar o novo valor |
| Excluir pelo menu da linha | confirmação → exclusão → "Desfazer" restaura a linha |
| Categoria com nome duplicado | recusada, com erro no campo |
| Excluir categoria com 460 lançamentos | bloqueada até escolher destino |
| Criar/excluir conta | saldo consolidado sobe e volta em R$ 125.000 |
| CSV com 6 linhas (3 inválidas) | 3 gravadas; as outras 3 listadas com linha e motivo |
| Senha errada | erro genérico na tela, `success: false` no histórico |
| Logout | `logoutAt` carimbado; volta para `/login` |
| Isolamento entre usuários | ler, editar e excluir dado de outro usuário: bloqueado |
| `passwordHash` em respostas | ausente |
| Seed rodado duas vezes | mesmos 1.653 lançamentos e mesmos totais |
| Console em 9 rotas | sem erros ou avisos |

## Decisões da etapa anterior (design e UX)

- **Nome**: *Finora* — curto, pronunciável em português e inglês, sem colisão com marcas reais.
- **Período e conta são globais**, controlados no header e compartilhados por contexto
  (`PeriodProvider`). Trocar o período no dashboard mantém a escolha ao navegar para
  relatórios ou transações, que é como esse tipo de ferramenta costuma ser usado.
- **Páginas são Client Components** que consomem `lib/api.ts` pelo hook `useAsync`. Isso
  torna os estados de carregamento reais e visíveis (o skeleton aparece a cada troca de
  filtro), que era um requisito explícito. O hook descarta respostas fora de ordem.
- **Animação de entrada dos gráficos desligada.** Com dados que trocam a cada filtro, a
  re-animação piscava a cada interação; o skeleton já cobre a transição. As sparklines e o
  gauge mantêm transição CSS.
- **Saúde financeira** é um índice composto e explicado no próprio card: margem (50%),
  liquidez em meses de caixa (30%) e ritmo de crescimento (20%). Preferi um número honesto
  e auditável a um número alto e decorativo.
- **Meta do mês** mostra também o *ritmo esperado* — um traço no trilho do medidor marca
  onde a meta deveria estar no dia de hoje, evitando a leitura equivocada de "20% da meta"
  no oitavo dia do mês.
- **Mês corrente não disputa "melhor/pior mês"** nos relatórios, por estar incompleto.
- **Exportar CSV / Gerar PDF** são simulações com estado de carregamento, sem geração real.
- **Responsivo em três faixas**: sidebar completa (≥1280px), recolhida em ícones
  (768–1279px) e, abaixo disso, drawer no header + tab bar inferior. Tabelas largas rolam
  dentro do próprio contêiner, nunca a página.
- **Acessibilidade**: navegação por teclado com foco visível em todos os controles,
  `aria-current` no item ativo, rótulos em ícones informativos, `role="progressbar"` nas
  barras de participação e contraste verificado nos dois temas.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 3 · Radix UI no padrão
shadcn/ui · Recharts · lucide-react · next-themes · Prisma 7 (driver adapter `pg`) ·
PostgreSQL · Auth.js v5 (credenciais + JWT) · Zod 4 · bcryptjs · sonner.

Para deploy na Vercel basta definir `DATABASE_URL` e `AUTH_SECRET` — o `build`
já roda `prisma generate`.
