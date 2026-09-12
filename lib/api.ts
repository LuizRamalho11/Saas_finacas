"use server";

/**
 * Consultas analíticas do produto.
 *
 * Tudo aqui agrega as linhas reais de `Transaction`, sempre filtrando por
 * `userId` vindo da sessão — nenhum parâmetro do cliente escolhe o dono dos
 * dados. Criar, editar ou excluir uma transação muda estes números na hora.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineQuery } from "@/lib/server/action";
import {
  idOrAllSchema,
  idSchema,
  limitSchema,
  monthsSchema,
  periodSchema,
  transactionQuerySchema,
} from "@/lib/server/schemas";
import { addDays, periodWindow, startOfUtcDay, toISODate } from "@/lib/periods";
import { colorForIndex } from "@/lib/palette";
import { divideMoney, money, subtractMoney, sumMoney, toNumber, ZERO, type Money } from "@/lib/money";
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

/**
 * `num` e `sum` existem só para o que vira pixel: agrupamento de pontos de
 * gráfico e média de sparkline. Todo total que o usuário lê é somado em
 * `Decimal` (lib/money.ts) — ver F16.
 */
const num = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);
const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

/** Quantidade de dias de uma janela de período, contando as duas pontas. */
function periodDays(window: { from: Date; to: Date }): number {
  return Math.round((window.to.getTime() - window.from.getTime()) / 86_400_000) + 1;
}

/** Totais do período somados no banco, em numeric — nunca em ponto flutuante. */
async function periodTotals(userId: string, from: Date, to: Date): Promise<{ revenue: Money; expense: Money }> {
  const [row] = await prisma.$queryRaw<{ revenue: string; expense: string }[]>`
    SELECT COALESCE(SUM(CASE WHEN "type" = 'income'  THEN "amount" END), 0)::text AS revenue,
           COALESCE(SUM(CASE WHEN "type" = 'expense' THEN "amount" END), 0)::text AS expense
      FROM "Transaction"
     WHERE "userId" = ${userId}
       AND "status" <> 'canceled'
       AND "date" >= ${from}
       AND "date" <= ${to}`;

  return { revenue: money(row?.revenue), expense: money(row?.expense) };
}

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

export const getKpis = defineQuery({
  name: "getKpis",
  input: periodSchema,
  async handler({ input: period, user }): Promise<Kpi[]> {
    const current = periodWindow(period);
    const previous = periodWindow(period, 1);
    const before = periodWindow(period, 2);

    const [currentSeries, currentMoney, previousMoney, beforeMoney, currentCount, previousCount] = await Promise.all([
      dailySeries(user.id, current.from, current.to),
      periodTotals(user.id, current.from, current.to),
      periodTotals(user.id, previous.from, previous.to),
      periodTotals(user.id, before.from, before.to),
      prisma.transaction.count({
        where: { userId: user.id, type: "income", status: ACTIVE, date: { gte: current.from, lte: current.to } },
      }),
      prisma.transaction.count({
        where: { userId: user.id, type: "income", status: ACTIVE, date: { gte: previous.from, lte: previous.to } },
      }),
    ]);

    // Somado no banco: a partir daqui só converte para número na borda.
    const revenue = toNumber(currentMoney.revenue);
    const prevRevenue = toNumber(previousMoney.revenue);
    const expense = toNumber(currentMoney.expense);
    const prevExpense = toNumber(previousMoney.expense);
    const profit = toNumber(subtractMoney(currentMoney.revenue, currentMoney.expense));
    const prevProfit = toNumber(subtractMoney(previousMoney.revenue, previousMoney.expense));

    const days = currentSeries.length || 1;
    const prevDays = periodDays(previous) || 1;
    const cashFlow = (profit / days) * 30;
    const prevCashFlow = (prevProfit / prevDays) * 30;

    const ticket = currentCount > 0 ? toNumber(divideMoney(currentMoney.revenue, currentCount)) : 0;
    const prevTicket = previousCount > 0 ? toNumber(divideMoney(previousMoney.revenue, previousCount)) : 0;

    const growth = pctChange(revenue, prevRevenue);
    const prevGrowth = pctChange(prevRevenue, toNumber(beforeMoney.revenue));

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
  },
});

export const getRevenueExpenseSeries = defineQuery({
  name: "getRevenueExpenseSeries",
  input: periodSchema,
  async handler({ input: period, user }): Promise<DailyPoint[]> {
    const { from, to } = periodWindow(period);
    const points = await dailySeries(user.id, from, to);
    return bucketize(points, period === "365d" ? 26 : period === "90d" ? 18 : 15);
  },
});

// ------------------------------------------------------- categorias e fontes

async function categoryTotals(userId: string, type: "income" | "expense", from: Date, to: Date) {
  const grouped = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { userId, type, status: ACTIVE, date: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  // Mantém Decimal: quem usa decide quando virar número.
  return new Map(grouped.map((row) => [row.categoryId, money(row._sum.amount)]));
}

export const getExpensesByCategory = defineQuery({
  name: "getExpensesByCategory",
  input: periodSchema,
  async handler({ input: period, user }): Promise<CategorySlice[]> {
    const current = periodWindow(period);
    const previous = periodWindow(period, 1);

    const [categories, currentTotals, previousTotals] = await Promise.all([
      prisma.category.findMany({ where: { userId: user.id, type: "expense" }, orderBy: { name: "asc" } }),
      categoryTotals(user.id, "expense", current.from, current.to),
      categoryTotals(user.id, "expense", previous.from, previous.to),
    ]);

    const total = sumMoney([...currentTotals.values()]);
    const totalNumber = toNumber(total);

    return categories
      .map((category, index) => {
        const amount = toNumber(currentTotals.get(category.id) ?? ZERO);
        return {
          id: category.id,
          label: category.name,
          short: shortLabel(category.name),
          amount,
          share: totalNumber > 0 ? amount / totalNumber : 0,
          color: category.color ?? colorForIndex(index),
          trend: pctChange(amount, toNumber(previousTotals.get(category.id) ?? ZERO)),
        };
      })
      .filter((slice) => slice.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  },
});

/** Encurta o rótulo para caber em eixos estreitos ("Software e ferramentas" → "Software"). */
function shortLabel(name: string) {
  const first = name.split(/\s+(?:e|de|do|da)\s+/i)[0];
  return first.length <= 12 ? first : `${first.slice(0, 11)}…`;
}

export const getRevenueSources = defineQuery({
  name: "getRevenueSources",
  input: periodSchema,
  async handler({ input: period, user }): Promise<RevenueSource[]> {
    const { from, to } = periodWindow(period);

    const [categories, totals] = await Promise.all([
      prisma.category.findMany({ where: { userId: user.id, type: "income" }, orderBy: { name: "asc" } }),
      categoryTotals(user.id, "income", from, to),
    ]);

    const total = toNumber(sumMoney([...totals.values()]));

    return categories
      .map((category, index) => {
        const amount = toNumber(totals.get(category.id) ?? ZERO);
        return {
          id: category.id,
          label: category.name,
          amount,
          share: total > 0 ? amount / total : 0,
          color: category.color ?? colorForIndex(index),
        };
      })
      .filter((source) => source.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  },
});

// ------------------------------------------------------------------ metas

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const getGoal = defineQuery({
  name: "getGoal",
  input: periodSchema,
  async handler({ input: period, user }): Promise<Goal> {
    const current = periodWindow(period);
    const previous = periodWindow(period, 1);

    const [currentMoney, previousMoney, accounts] = await Promise.all([
      periodTotals(user.id, current.from, current.to),
      periodTotals(user.id, previous.from, previous.to),
      listAccountBalances(user.id),
    ]);

    const revenue = toNumber(currentMoney.revenue);
    const expense = toNumber(currentMoney.expense);
    const days = periodDays(current) || 1;

    const margin = revenue > 0 ? (revenue - expense) / revenue : 0;
    const marginScore = clamp01(margin / 0.3); // 30% de margem = nota cheia

    const cash = toNumber(sumMoney(accounts.map((account) => account.balance)));
    const monthlyBurn = (expense / days) * 30;
    const runwayMonths = monthlyBurn > 0 ? cash / monthlyBurn : 12;
    const liquidityScore = clamp01(runwayMonths / 6); // 6 meses de caixa = nota cheia

    const growth = pctChange(revenue, toNumber(previousMoney.revenue));
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
  },
});

export const getMonthlyGoal = defineQuery({
  name: "getMonthlyGoal",
  async handler({ user }): Promise<Goal> {
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
  },
});

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

  // Saldo é dinheiro: soma em Decimal e só vira número ao sair daqui.
  const movement = new Map<string, Money>();
  for (const row of grouped) {
    const amount = money(row._sum.amount);
    const signed = row.type === "income" ? amount : amount.negated();
    movement.set(row.accountId, (movement.get(row.accountId) ?? ZERO).plus(signed));
  }

  return accounts.map((account) => ({
    id: account.id,
    label: account.name,
    institution: account.institution ?? "",
    balance: toNumber(money(account.openingBalance).plus(movement.get(account.id) ?? ZERO)),
    kind: normalizeAccountKind(account.type),
  }));
}

function normalizeAccountKind(type: string): Account["kind"] {
  if (type === "savings") return "savings";
  if (type === "credit_card" || type === "card") return "card";
  if (type === "investment") return "investment";
  return "checking";
}

export const getAccounts = defineQuery({
  name: "getAccounts",
  async handler({ user }): Promise<Account[]> {
    return listAccountBalances(user.id);
  },
});

// ----------------------------------------------------------- fluxo de caixa

const PROJECTION_DAYS = 90;

/** Filtros do fluxo de caixa: mantém os padrões que a assinatura antiga tinha. */
const cashFlowSchema = z
  .object({
    accountId: idOrAllSchema.default("all"),
    period: periodSchema.default("90d"),
  })
  .default({ accountId: "all", period: "90d" });

export const getCashFlow = defineQuery({
  name: "getCashFlow",
  input: cashFlowSchema,
  async handler({ input: { accountId, period }, user }): Promise<CashFlowPoint[]> {
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

    // Saldo de abertura somado em Decimal; a partir daí a série é gráfico.
    const openingBalance = accounts.reduce<Money>((total, account) => total.plus(money(account.openingBalance)), ZERO);
    const priorBalance = priorMovement.reduce<Money>((total, row) => {
      const amount = money(row._sum.amount);
      return total.plus(row.type === "income" ? amount : amount.negated());
    }, openingBalance);

    let balance = toNumber(priorBalance);

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
  },
});

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

export const getMonthlySeries = defineQuery({
  name: "getMonthlySeries",
  input: monthsSchema.default(24),
  async handler({ input: months, user }): Promise<MonthlyPoint[]> {
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
      rows.map((row) => [
        toISODate(new Date(row.month)),
        { revenue: Number(row.revenue), expense: Number(row.expense) },
      ]),
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
  },
});

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

export const getTransactions = defineQuery({
  name: "getTransactions",
  input: transactionQuerySchema.default({}),
  async handler({ input: query, user }): Promise<TransactionPage> {
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
  },
});

export const getRecentTransactions = defineQuery({
  name: "getRecentTransactions",
  input: limitSchema.default(6),
  async handler({ input: limit, user }): Promise<Transaction[]> {
    const rows = await prisma.transaction.findMany({
      where: { userId: user.id, date: { lte: startOfUtcDay() } },
      include: TRANSACTION_INCLUDE,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    return rows.map(toTransaction);
  },
});

export const getTransaction = defineQuery({
  name: "getTransaction",
  input: idSchema,
  async handler({ input: id, user }): Promise<Transaction | null> {
    // O id vem da URL/cliente: o filtro por userId impede ler o registro de outro usuário.
    const row = await prisma.transaction.findFirst({
      where: { id, userId: user.id },
      include: TRANSACTION_INCLUDE,
    });
    return row ? toTransaction(row) : null;
  },
});

// ------------------------------------------------------------------ perfil

export const getProfile = defineQuery({
  name: "getProfile",
  async handler({ user }): Promise<UserProfile> {
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
  },
});
