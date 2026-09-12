"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard, KpiCardSkeleton } from "@/components/dashboard/kpi-card";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { SectionHeading } from "@/components/common/section-heading";
import { RevenueExpenseChart } from "@/components/charts/revenue-expense-chart";
import { CategoryBarChart } from "@/components/charts/category-bar-chart";
import { GaugeWidget } from "@/components/charts/gauge-widget";
import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { Delta } from "@/components/common/delta";
import { usePeriod } from "@/components/layout/period-context";
import { usePreferences } from "@/components/providers";
import { useAsync } from "@/lib/use-async";
import { COMPARISON_LABEL, PERIOD_LABEL } from "@/lib/periods";
import {
  getExpensesByCategory,
  getGoal,
  getKpis,
  getMonthlyGoal,
  getRecentTransactions,
  getRevenueExpenseSeries,
  getRevenueSources,
} from "@/lib/api";
import { listCategories } from "@/lib/actions/categories";
import { listAccounts } from "@/lib/actions/accounts";
import { formatCompact } from "@/lib/format";

export default function DashboardPage() {
  const { period } = usePeriod();
  const { currency } = usePreferences();

  // Incrementado após cada mutação para reconsultar todos os indicadores.
  const [revision, setRevision] = React.useState(0);
  const [formOpen, setFormOpen] = React.useState(false);
  const refresh = React.useCallback(() => setRevision((value) => value + 1), []);

  const kpis = useAsync(() => getKpis(period), [period, revision]);
  const series = useAsync(() => getRevenueExpenseSeries(period), [period, revision]);
  const categories = useAsync(() => getExpensesByCategory(period), [period, revision]);
  const sources = useAsync(() => getRevenueSources(period), [period, revision]);
  const health = useAsync(() => getGoal(period), [period, revision]);
  const monthlyGoal = useAsync(() => getMonthlyGoal(), [revision]);
  const recent = useAsync(() => getRecentTransactions(6), [period, revision]);
  const formCategories = useAsync(() => listCategories(), [revision]);
  const formAccounts = useAsync(() => listAccounts(), [revision]);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Visão geral"
        description={`${PERIOD_LABEL[period]} · indicadores recalculados a cada lançamento`}
        action={
          <Button onClick={() => setFormOpen(true)}>
            <Plus aria-hidden /> Nova transação
          </Button>
        }
      />

      {/* KPIs */}
      <section
        aria-label="Indicadores do período"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
      >
        {kpis.loading || !kpis.data
          ? Array.from({ length: 6 }).map((_, index) => <KpiCardSkeleton key={index} />)
          : kpis.data.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} comparisonLabel={COMPARISON_LABEL[period]} />)}
      </section>

      {/* Série principal + medidores */}
      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="flex flex-col xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Receita x Despesa</CardTitle>
              <CardDescription>{PERIOD_LABEL[period]} · valores agregados por bucket</CardDescription>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[hsl(var(--chart-1))]" aria-hidden /> Receita
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[hsl(var(--chart-4))]" aria-hidden /> Despesa
              </span>
            </div>
          </CardHeader>
          <CardContent className="min-h-[300px] flex-1">
            {series.loading || !series.data ? (
              <ChartSkeleton className="h-full" bars={14} />
            ) : (
              <RevenueExpenseChart data={series.data} height="100%" />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Card>
            <CardHeader className="pb-0">
              <div>
                <CardTitle>Saúde financeira</CardTitle>
                <CardDescription>Margem e liquidez combinadas</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              {health.loading || !health.data ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <Skeleton className="size-[168px] rounded-full" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ) : (
                <GaugeWidget
                  progress={health.data.progress}
                  label={health.data.label}
                  caption={health.data.caption}
                  colorVar={health.data.colorVar}
                  size={168}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <div>
                <CardTitle>Meta do mês</CardTitle>
                <CardDescription>Receita reconhecida vs. meta comercial</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              {monthlyGoal.loading || !monthlyGoal.data ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <Skeleton className="size-[168px] rounded-full" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ) : (
                <GaugeWidget
                  progress={monthlyGoal.data.progress}
                  label={`de ${formatCompact(monthlyGoal.data.target, currency)}`}
                  display={formatCompact(monthlyGoal.data.value, currency)}
                  caption={monthlyGoal.data.caption}
                  markerAt={monthlyGoal.data.expected}
                  colorVar={monthlyGoal.data.colorVar}
                  size={168}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Categorias + fontes de receita */}
      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="flex flex-col xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Despesas por categoria</CardTitle>
              <CardDescription>{PERIOD_LABEL[period]}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/reports">
                Ver relatório <ArrowRight aria-hidden />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="min-h-[260px] flex-1">
            {categories.loading || !categories.data ? (
              <ChartSkeleton className="h-full" bars={6} />
            ) : (
              <CategoryBarChart data={categories.data} height="100%" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Origem da receita</CardTitle>
              <CardDescription>Participação por linha de negócio</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {sources.loading || !sources.data
              ? Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))
              : sources.data.map((source) => (
                  <div key={source.id} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-foreground">{source.label}</span>
                      <span className="tabular text-sm font-semibold text-foreground">
                        {formatCompact(source.amount, currency)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
                      <div
                        className="h-full rounded-full transition-[width] duration-700"
                        style={{
                          width: `${source.share * 100}%`,
                          background: source.color,
                        }}
                        role="progressbar"
                        aria-valuenow={Math.round(source.share * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${source.label}: ${Math.round(source.share * 100)}% da receita`}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(source.share * 100).toFixed(1).replace(".", ",")}% do total
                    </p>
                  </div>
                ))}

            {categories.data ? (
              <div className="mt-2 space-y-2 border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-subtle">Maior variação</p>
                {categories.data.slice(0, 3).map((slice) => (
                  <div key={slice.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-muted-foreground">{slice.label}</span>
                    <Delta value={slice.trend} inverse />
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {/* Transações recentes */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Transações recentes</CardTitle>
            <CardDescription>Últimos lançamentos conciliados em todas as contas</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/transactions">
              Ver todas <ArrowRight aria-hidden />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <TransactionsTable
            rows={recent.data ?? []}
            loading={recent.loading}
            dense
            emptyTitle="Nenhum lançamento ainda"
            emptyDescription="Crie a primeira transação para ver os indicadores ganharem vida."
            emptyAction={
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus aria-hidden /> Nova transação
              </Button>
            }
          />
        </CardContent>
      </Card>

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={formCategories.data ?? []}
        accounts={formAccounts.data ?? []}
        onSaved={refresh}
      />
    </div>
  );
}
