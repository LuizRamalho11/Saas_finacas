"use server";

/**
 * Consultas analíticas do produto.
 *
 * Tudo aqui agrega as linhas reais de `Transaction`, sempre filtrando por
 * `userId` vindo da sessão — nenhum parâmetro do cliente escolhe o dono dos
 * dados. Criar, editar ou excluir uma transação muda estes números na hora.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guard";
import { addDays, periodWindow, startOfUtcDay, toISODate, PERIOD_DAYS } from "@/lib/periods";
import { colorForIndex } from "@/lib/palette";
import { transactionWhereFor } from "@/lib/actions/query-helpers";
import type {
  Account,
  CashFlowPoint,
  CategorySlice,
  DailyPoint,
  Goal,
  Kpi,
  MonthlyPoint,
  Period,
  RevenueSource,
  Transaction,
  TransactionStatus,
  UserProfile,
} from "@/types";

/** Lançamentos cancelados existem no extrato mas não entram em nenhuma métrica. */
const ACTIVE = { not: "canceled" } as const;

const num = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);
const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

function pctChange(current: number, previous: number) {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ------------------------------------------------------------------ séries

/**
 * Série diária de receita e despesa, com os dias sem lançamento preenchidos
 * com zero para que os gráficos não tenham buracos.
 */
async function dailySeries(userId: string, from: Date, to: Date): Promise<DailyPoint[]> {
  const rows = await prisma.$queryRaw<{ day: Date; revenue: string; expense: string }[]>`
    SELECT date_trunc('day', "date") AS day,
           COALESCE(SUM(CASE WHEN "type" = 'income'  THEN "amount" END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN "type" = 'expense' THEN "amount" END), 0) AS expense
      FROM "Transaction"
     WHERE "userId" = ${userId}
       AND "status" <> 'canceled'
       AND "date" >= ${from}
       AND "date" <= ${to}
     GROUP BY 1
     ORDER BY 1`;

  const byDay = new Map(
    rows.map((row) => [toISODate(new Date(row.day)), { revenue: Number(row.revenue), expense: Number(row.expense) }]),
  );

  const series: DailyPoint[] = [];
  for (let cursor = new Date(from); cursor <= to; cursor = addDays(cursor, 1)) {
    const iso = toISODate(cursor);
    const entry = byDay.get(iso);
    series.push({ date: iso, revenue: entry?.revenue ?? 0, expense: entry?.expense ?? 0 });
  }
  return series;
}

/** Agrupa a série diária em buckets para não plotar 365 pontos ilegíveis. */
function bucketize(points: DailyPoint[], maxPoints: number): DailyPoint[] {
  if (points.length <= maxPoints) return points;
  const size = Math.ceil(points.length / maxPoints);
  const out: DailyPoint[] = [];
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    out.push({
      date: chunk[chunk.length - 1].date,
      revenue: Math.round(sum(chunk.map((p) => p.revenue))),
      expense: Math.round(sum(chunk.map((p) => p.expense))),
    });
  }
  return out;
}

function sparkline(points: DailyPoint[], selector: (p: DailyPoint) => number, buckets = 14) {
  if (!points.length) return [];
  const size = Math.max(1, Math.ceil(points.length / buckets));
  const out: { date: string; value: number }[] = [];
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    out.push({
      date: chunk[chunk.length - 1].date,
      value: Math.round(sum(chunk.map(selector)) / chunk.length),
    });
  }
  return out;
}

// ------------------------------------------------------------------- KPIs

export async function getKpis(period: Period): Promise<Kpi[]> {
  const user = await requireUser();
  const current = periodWindow(period);
  const previous = periodWindow(period, 1);
  const before = periodWindow(period, 2);

  const [currentSeries, previousSeries, beforeSeries, currentCount, previousCount] = await Promise.all([
    dailySeries(user.id, current.from, current.to),
    dailySeries(user.id, previous.from, previous.to),
    dailySeries(user.id, before.from, before.to),
    prisma.transaction.count({
      where: { userId: user.id, type: "income", status: ACTIVE, date: { gte: current.from, lte: current.to } },
    }),
    prisma.transaction.count({
      where: { userId: user.id, type: "income", status: ACTIVE, date: { gte: previous.from, lte: previous.to } },
    }),
  ]);

  const revenue = sum(currentSeries.map((p) => p.revenue));
  const prevRevenue = sum(previousSeries.map((p) => p.revenue));
  const expense = sum(currentSeries.map((p) => p.expense));
  const prevExpense = sum(previousSeries.map((p) => p.expense));
  const profit = revenue - expense;
  const prevProfit = prevRevenue - prevExpense;

  const days = currentSeries.length || 1;
  const prevDays = previousSeries.length || 1;
  const cashFlow = (profit / days) * 30;
  const prevCashFlow = (prevProfit / prevDays) * 30;

  const ticket = currentCount > 0 ? revenue / currentCount : 0;
  const prevTicket = previousCount > 0 ? prevRevenue / previousCount : 0;

  const growth = pctChange(revenue, prevRevenue);
  const prevGrowth = pctChange(prevRevenue, sum(beforeSeries.map((p) => p.revenue)));

  return [
    {
      id: "revenue",
      label: "Receita total",
      value: revenue,
      previousValue: prevRevenue,
      change: pctChange(revenue, prevRevenue),
      format: "currency",
      hint: "Receita bruta reconhecida no período",
      colorVar: "--chart-1",
      spark: sparkline(currentSeries, (p) => p.revenue),
    },
    {
      id: "expense",
      label: "Despesas totais",
      value: expense,
      previousValue: prevExpense,
      change: pctChange(expense, prevExpense),
      format: "currency",
      hint: "Saídas consolidadas de todas as contas",
      colorVar: "--chart-4",
      inverse: true,
      spark: sparkline(currentSeries, (p) => p.expense),
    },
    {
      id: "profit",
      label: "Lucro líquido",
      value: profit,
      previousValue: prevProfit,
      change: pctChange(profit, prevProfit),
      format: "currency",
      hint: "Receita menos despesas no período",
      colorVar: "--chart-2",
      spark: sparkline(currentSeries, (p) => p.revenue - p.expense),
    },
    {
      id: "cash-flow",
      label: "Fluxo de caixa",
      value: cashFlow,
      previousValue: prevCashFlow,
      change: pctChange(cashFlow, prevCashFlow),
      format: "currency",
      hint: "Geração de caixa normalizada por mês",
      colorVar: "--chart-3",
      spark: sparkline(currentSeries, (p) => p.revenue - p.expense),
    },
    {
      id: "ticket",
      label: "Ticket médio",
      value: ticket,
      previousValue: prevTicket,
      change: pctChange(ticket, prevTicket),
      format: "currency",
      hint: `Receita dividida por ${currentCount} lançamentos de entrada`,
      colorVar: "--chart-5",
      spark: sparkline(currentSeries, (p) => p.revenue),
    },
    {
      id: "growth",
      label: "Taxa de crescimento",
      value: growth,
      previousValue: prevGrowth,
      change: growth - prevGrowth,
      format: "percent",
      hint: "Variação da receita vs. período anterior",
      colorVar: "--chart-6",
      spark: sparkline(currentSeries, (p) => p.revenue),
    },
  ];
}

export async function getRevenueExpenseSeries(period: Period): Promise<DailyPoint[]> {
  const user = await requireUser();
  const { from, to } = periodWindow(period);
  const points = await dailySeries(user.id, from, to);
  return bucketize(points, period === "365d" ? 26 : period === "90d" ? 18 : 15);
}

// ------------------------------------------------------- categorias e fontes

async function categoryTotals(userId: string, type: "income" | "expense", from: Date, to: Date) {
  const grouped = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { userId, type, status: ACTIVE, date: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  return new Map(grouped.map((row) => [row.categoryId, num(row._sum.amount)]));
}

export async function getExpensesByCategory(period: Period): Promise<CategorySlice[]> {
  const user = await requireUser();
  const current = periodWindow(period);
  const previous = periodWindow(period, 1);

  const [categories, currentTotals, previousTotals] = await Promise.all([
    prisma.category.findMany({ where: { userId: user.id, type: "expense" }, orderBy: { name: "asc" } }),
    categoryTotals(user.id, "expense", current.from, current.to),
    categoryTotals(user.id, "expense", previous.from, previous.to),
  ]);

  const total = sum([...currentTotals.values()]);

  return categories
    .map((category, index) => {
      const amount = currentTotals.get(category.id) ?? 0;
      return {
        id: category.id,
        label: category.name,
        short: shortLabel(category.name),
        amount,
        share: total > 0 ? amount / total : 0,
        color: category.color ?? colorForIndex(index),
        trend: pctChange(amount, previousTotals.get(category.id) ?? 0),
      };
    })
    .filter((slice) => slice.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/** Encurta o rótulo para caber em eixos estreitos ("Software e ferramentas" → "Software"). */
function shortLabel(name: string) {
  const first = name.split(/\s+(?:e|de|do|da)\s+/i)[0];
  return first.length <= 12 ? first : `${first.slice(0, 11)}…`;
}

export async function getRevenueSources(period: Period): Promise<RevenueSource[]> {
  const user = await requireUser();
  const { from, to } = periodWindow(period);

  const [categories, totals] = await Promise.all([
    prisma.category.findMany({ where: { userId: user.id, type: "income" }, orderBy: { name: "asc" } }),
    categoryTotals(user.id, "income", from, to),
  ]);

  const total = sum([...totals.values()]);

  return categories
    .map((category, index) => ({
      id: category.id,
      label: category.name,
      amount: totals.get(category.id) ?? 0,
      share: total > 0 ? (totals.get(category.id) ?? 0) / total : 0,
      color: category.color ?? colorForIndex(index),
    }))
    .filter((source) => source.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

// ------------------------------------------------------------------ metas

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export async function getGoal(period: Period): Promise<Goal> {
  const user = await requireUser();
  const current = periodWindow(period);
  const previous = periodWindow(period, 1);

  const [currentSeries, previousSeries, accounts] = await Promise.all([
    dailySeries(user.id, current.from, current.to),
    dailySeries(user.id, previous.from, previous.to),
    listAccountBalances(user.id),
  ]);

  const revenue = sum(currentSeries.map((p) => p.revenue));
  const expense = sum(currentSeries.map((p) => p.expense));
  const days = currentSeries.length || 1;

  const margin = revenue > 0 ? (revenue - expense) / revenue : 0;
  const marginScore = clamp01(margin / 0.3); // 30% de margem = nota cheia

  const cash = sum(accounts.map((account) => account.balance));
  const monthlyBurn = (expense / days) * 30;
  const runwayMonths = monthlyBurn > 0 ? cash / monthlyBurn : 12;
  const liquidityScore = clamp01(runwayMonths / 6); // 6 meses de caixa = nota cheia

  const growth = pctChange(revenue, sum(previousSeries.map((p) => p.revenue)));
  const growthScore = clamp01((growth + 5) / 20);

  const score = Math.round((marginScore * 0.5 + liquidityScore * 0.3 + growthScore * 0.2) * 100);

  return {
    id: "health",
    label: "Saúde financeira",
    caption: `Margem de ${(margin * 100).toFixed(1).replace(".", ",")}% e ${runwayMonths.toFixed(1).replace(".", ",")} meses de caixa`,
    value: score,
    target: 100,
    progress: score / 100,
    colorVar: score >= 65 ? "--success" : score >= 40 ? "--warning" : "--danger",
  };
}

export async function getMonthlyGoal(): Promise<Goal> {
  const user = await requireUser();
  const today = startOfUtcDay();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();

  const [achievedRow, referenceRow] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId: user.id, type: "income", status: ACTIVE, date: { gte: monthStart, lte: today } },
      _sum: { amount: true },
    }),
    // Meta derivada da média dos 3 meses anteriores, com 8% de ambição
    prisma.transaction.aggregate({
      where: {
        userId: user.id,
        type: "income",
        status: ACTIVE,
        date: { gte: addDays(monthStart, -92), lt: monthStart },
      },
      _sum: { amount: true },
    }),
  ]);

  const achieved = num(achievedRow._sum.amount);
  const target = Math.max(1, Math.round((num(referenceRow._sum.amount) / 3) * 1.08));

  const elapsed = today.getUTCDate();
  const expected = elapsed / daysInMonth;
  const pace = expected > 0 ? achieved / (target * expected) : 0;

  return {
    id: "monthly-target",
    label: "Meta do mês",
    caption: `${elapsed} de ${daysInMonth} dias · ${Math.round(pace * 100)}% do ritmo esperado`,
    value: achieved,
    target,
    progress: clamp01(achieved / target),
    expected,
    colorVar: pace >= 1 ? "--chart-3" : "--warning",
    detail: `Ritmo esperado hoje: ${Math.round(expected * 100)}%`,
  };
}

// --------------------------------------------------------------- contas

async function listAccountBalances(userId: string): Promise<Account[]> {
  const [accounts, grouped] = await Promise.all([
    prisma.account.findMany({ where: { userId, archived: false }, orderBy: { createdAt: "asc" } }),
    prisma.transaction.groupBy({
      by: ["accountId", "type"],
      where: { userId, status: ACTIVE },
      _sum: { amount: true },
    }),
  ]);

  const movement = new Map<string, number>();
  for (const row of grouped) {
    const signed = row.type === "income" ? num(row._sum.amount) : -num(row._sum.amount);
    movement.set(row.accountId, (movement.get(row.accountId) ?? 0) + signed);
  }

  return accounts.map((account) => ({
    id: account.id,
    label: account.name,
    institution: account.institution ?? "",
    balance: num(account.openingBalance) + (movement.get(account.id) ?? 0),
    kind: normalizeAccountKind(account.type),
  }));
}

function normalizeAccountKind(type: string): Account["kind"] {
  if (type === "savings") return "savings";
  if (type === "credit_card" || type === "card") return "card";
  if (type === "investment") return "investment";
  return "checking";
}

export async function getAccounts(): Promise<Account[]> {
  const user = await requireUser();
  return listAccountBalances(user.id);
}

// ----------------------------------------------------------- fluxo de caixa

const PROJECTION_DAYS = 90;

export async function getCashFlow(accountId = "all", period: Period = "90d"): Promise<CashFlowPoint[]> {
  const user = await requireUser();
  const { from, to } = periodWindow(period);
  const accountFilter = accountId === "all" ? {} : { accountId };

  // Saldo de abertura da janela: saldo inicial das contas + tudo que já se moveu antes
  const [accounts, priorMovement, rows] = await Promise.all([
    prisma.account.findMany({
      where: { userId: user.id, archived: false, ...(accountId === "all" ? {} : { id: accountId }) },
      select: { openingBalance: true },
    }),
    prisma.transaction.groupBy({
      by: ["type"],
      where: { userId: user.id, status: ACTIVE, date: { lt: from }, ...accountFilter },
      _sum: { amount: true },
    }),
    prisma.$queryRaw<{ day: Date; inflow: string; outflow: string }[]>`
      SELECT date_trunc('day', "date") AS day,
             COALESCE(SUM(CASE WHEN "type" = 'income'  THEN "amount" END), 0) AS inflow,
             COALESCE(SUM(CASE WHEN "type" = 'expense' THEN "amount" END), 0) AS outflow
        FROM "Transaction"
       WHERE "userId" = ${user.id}
         AND "status" <> 'canceled'
         AND "date" >= ${from}
         AND "date" <= ${to}
         ${accountId === "all" ? Prisma.empty : Prisma.sql`AND "accountId" = ${accountId}`}
       GROUP BY 1
       ORDER BY 1`,
  ]);

  let balance = sum(accounts.map((account) => num(account.openingBalance)));
  for (const row of priorMovement) {
    balance += row.type === "income" ? num(row._sum.amount) : -num(row._sum.amount);
  }

  const byDay = new Map(
    rows.map((row) => [toISODate(new Date(row.day)), { inflow: Number(row.inflow), outflow: Number(row.outflow) }]),
  );

  const points: CashFlowPoint[] = [];
  for (let cursor = new Date(from); cursor <= to; cursor = addDays(cursor, 1)) {
    const iso = toISODate(cursor);
    const entry = byDay.get(iso) ?? { inflow: 0, outflow: 0 };
    balance += entry.inflow - entry.outflow;
    points.push({
      date: iso,
      actual: Math.round(balance),
      projected: null,
      inflow: Math.round(entry.inflow),
      outflow: Math.round(entry.outflow),
    });
  }

  if (points.length) points[points.length - 1].projected = points[points.length - 1].actual;

  // Projeção: média móvel dos últimos 30 dias realizados
  const tail = points.slice(-30);
  const avgIn = sum(tail.map((p) => p.inflow)) / (tail.length || 1);
  const avgOut = sum(tail.map((p) => p.outflow)) / (tail.length || 1);

  for (let i = 1; i <= PROJECTION_DAYS; i += 1) {
    const date = addDays(to, i);
    const growth = Math.pow(1.0004, i);
    balance += avgIn * growth - avgOut;
    points.push({
      date: toISODate(date),
      actual: null,
      projected: Math.round(balance),
      inflow: Math.round(avgIn * growth),
      outflow: Math.round(avgOut),
    });
  }

  return bucketizeCashFlow(points, 60);
}

function bucketizeCashFlow(points: CashFlowPoint[], maxPoints: number): CashFlowPoint[] {
  if (points.length <= maxPoints) return points;
  const size = Math.ceil(points.length / maxPoints);
  const out: CashFlowPoint[] = [];
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    const last = chunk[chunk.length - 1];
    out.push({
      date: last.date,
      actual: last.actual,
      projected: last.projected,
      inflow: Math.round(sum(chunk.map((p) => p.inflow))),
      outflow: Math.round(sum(chunk.map((p) => p.outflow))),
    });
  }
  const lastActual = out.reduce((acc, point, index) => (point.actual !== null ? index : acc), 0);
  if (out[lastActual] && out[lastActual].projected === null) {
    out[lastActual].projected = out[lastActual].actual;
  }
  return out;
}

// ------------------------------------------------------------- relatórios

export async function getMonthlySeries(months = 24): Promise<MonthlyPoint[]> {
  const user = await requireUser();
  const today = startOfUtcDay();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (months - 1), 1));

  const rows = await prisma.$queryRaw<{ month: Date; revenue: string; expense: string }[]>`
    SELECT date_trunc('month', "date") AS month,
           COALESCE(SUM(CASE WHEN "type" = 'income'  THEN "amount" END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN "type" = 'expense' THEN "amount" END), 0) AS expense
      FROM "Transaction"
     WHERE "userId" = ${user.id}
       AND "status" <> 'canceled'
       AND "date" >= ${from}
       AND "date" <= ${today}
     GROUP BY 1
     ORDER BY 1`;

  const byMonth = new Map(
    rows.map((row) => [toISODate(new Date(row.month)), { revenue: Number(row.revenue), expense: Number(row.expense) }]),
  );

  const out: MonthlyPoint[] = [];
  for (let i = 0; i < months; i += 1) {
    const month = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
    if (month > today) break;
    const iso = toISODate(month);
    const entry = byMonth.get(iso) ?? { revenue: 0, expense: 0 };
    out.push({
      month: iso,
      revenue: Math.round(entry.revenue),
      expense: Math.round(entry.expense),
      profit: Math.round(entry.revenue - entry.expense),
    });
  }
  return out;
}

// ------------------------------------------------------------- transações

export interface TransactionQuery {
  search?: string;
  categoryId?: string;
  status?: TransactionStatus | "all";
  type?: "all" | "income" | "expense";
  period?: Period;
  accountId?: string;
  page?: number;
  pageSize?: number;
}

export interface TransactionPage {
  rows: Transaction[];
  total: number;
  page: number;
  pageCount: number;
  totalIncome: number;
  totalExpense: number;
}

const TRANSACTION_INCLUDE = {
  category: { select: { id: true, name: true, color: true } },
  account: { select: { id: true, name: true } },
} satisfies Prisma.TransactionInclude;

type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof TRANSACTION_INCLUDE }>;

/** Converte a linha do banco (com Decimal e Date) para o formato serializável da UI. */
function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    date: toISODate(row.date),
    description: row.description,
    counterparty: row.counterparty ?? "",
    categoryId: row.categoryId,
    categoryLabel: row.category.name,
    categoryColor: row.category.color,
    accountId: row.accountId,
    accountLabel: row.account.name,
    type: row.type as Transaction["type"],
    amount: num(row.amount),
    status: row.status as TransactionStatus,
    method: row.method ?? "",
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getTransactions(query: TransactionQuery = {}): Promise<TransactionPage> {
  const user = await requireUser();
  const { page = 1, pageSize = 8 } = query;
  const where = transactionWhereFor(user.id, query);

  const [total, totals] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({ by: ["type"], where, _sum: { amount: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);

  const rows = await prisma.transaction.findMany({
    where,
    include: TRANSACTION_INCLUDE,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    skip: (safePage - 1) * pageSize,
    take: pageSize,
  });

  const totalFor = (type: string) => num(totals.find((row) => row.type === type)?._sum.amount);

  return {
    rows: rows.map(toTransaction),
    total,
    page: safePage,
    pageCount,
    totalIncome: totalFor("income"),
    totalExpense: totalFor("expense"),
  };
}

export async function getRecentTransactions(limit = 6): Promise<Transaction[]> {
  const user = await requireUser();
  const rows = await prisma.transaction.findMany({
    where: { userId: user.id, date: { lte: startOfUtcDay() } },
    include: TRANSACTION_INCLUDE,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return rows.map(toTransaction);
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const user = await requireUser();
  // O id vem da URL/cliente: o filtro por userId impede ler o registro de outro usuário.
  const row = await prisma.transaction.findFirst({
    where: { id, userId: user.id },
    include: TRANSACTION_INCLUDE,
  });
  return row ? toTransaction(row) : null;
}

// ------------------------------------------------------------------ perfil

export async function getProfile(): Promise<UserProfile> {
  const user = await requireUser();
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return {
    name: user.name,
    role: user.role,
    email: user.email,
    company: user.company,
    initials: initials || "U",
    timezone: user.timezone,
  };
}
