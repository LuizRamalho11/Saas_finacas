"use client";

import { Building2, CreditCard, Landmark, PiggyBank, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CashFlowChart } from "@/components/charts/cash-flow-chart";
import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { SectionHeading } from "@/components/common/section-heading";
import { Delta } from "@/components/common/delta";
import { usePeriod } from "@/components/layout/period-context";
import { usePreferences } from "@/components/providers";
import { useAsync } from "@/lib/use-async";
import { getAccounts, getCashFlow } from "@/lib/api";
import { PERIOD_LABEL, todayIso } from "@/lib/periods";
import { formatCurrency } from "@/lib/format";
import type { Account } from "@/types";

const ACCOUNT_ICON = {
  checking: Landmark,
  savings: PiggyBank,
  card: CreditCard,
  investment: TrendingUp,
} as const;

export default function CashFlowPage() {
  const { period, accountId, setAccountId } = usePeriod();
  const { currency } = usePreferences();

  const flow = useAsync(() => getCashFlow(accountId, period), [accountId, period]);
  const accounts = useAsync(() => getAccounts(), []);

  const points = flow.data ?? [];
  const realized = points.filter((p) => p.actual !== null);
  const projected = points.filter((p) => p.projected !== null);

  const currentBalance = realized.at(-1)?.actual ?? 0;
  const openingBalance = realized[0]?.actual ?? 0;
  const projectedBalance = projected.at(-1)?.projected ?? 0;
  const inflow = realized.reduce((acc, p) => acc + p.inflow, 0);
  const outflow = realized.reduce((acc, p) => acc + p.outflow, 0);
  const burn = (outflow - inflow) / Math.max(1, realized.length);
  const runwayMonths = burn > 0 ? currentBalance / (burn * 30) : Infinity;

  const summary = [
    {
      label: "Saldo atual",
      value: currentBalance,
      caption: "vs. início do período",
      delta: openingBalance ? ((currentBalance - openingBalance) / Math.abs(openingBalance)) * 100 : 0,
    },
    {
      label: "Entradas no período",
      value: inflow,
      caption: PERIOD_LABEL[period],
      delta: null,
    },
    {
      label: "Saídas no período",
      value: -outflow,
      caption: PERIOD_LABEL[period],
      delta: null,
    },
    {
      label: "Projeção em 90 dias",
      value: projectedBalance,
      caption:
        runwayMonths === Infinity
          ? "Operação gerando caixa"
          : `Runway estimado de ${runwayMonths.toFixed(1).replace(".", ",")} meses`,
      delta: currentBalance ? ((projectedBalance - currentBalance) / Math.abs(currentBalance)) * 100 : 0,
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Posição consolidada"
        description="Saldo consolidado, com projeção determinística para os próximos 90 dias."
        action={
          <div className="w-full sm:w-56">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger aria-label="Filtrar por conta ou entidade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as contas</SelectItem>
                {(accounts.data ?? []).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.label}
                    {account.institution ? ` · ${account.institution}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.label} className="p-5">
            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
            {flow.loading ? (
              <Skeleton className="mt-2 h-7 w-32" />
            ) : (
              <p className="mt-1.5 text-kpi font-semibold tabular text-foreground">
                {formatCurrency(item.value, currency, { maximumFractionDigits: 0 })}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              {item.delta !== null && !flow.loading ? <Delta value={item.delta} /> : null}
              <span className="truncate text-[11px] text-subtle">{item.caption}</span>
            </div>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Realizado x projetado</CardTitle>
            <CardDescription>
              Linha sólida é saldo conciliado; a tracejada projeta a média móvel de 30 dias.
            </CardDescription>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5 rounded-full bg-[hsl(var(--chart-2))]" aria-hidden /> Realizado
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-5 rounded-full"
                style={{ background: "repeating-linear-gradient(90deg, hsl(var(--chart-3)) 0 5px, transparent 5px 9px)" }}
                aria-hidden
              />
              Projetado
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {flow.loading || !flow.data ? (
            <ChartSkeleton height={340} bars={18} />
          ) : (
            <CashFlowChart data={flow.data} todayIso={todayIso()} />
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Contas e entidades</CardTitle>
              <CardDescription>Saldos consolidados na data de hoje</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.loading || !accounts.data
              ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-lg" />)
              : accounts.data.map((account) => <AccountRow key={account.id} account={account} />)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Compromissos previstos</CardTitle>
              <CardDescription>Saídas relevantes já agendadas</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Folha de pagamento", when: "Todo dia 5 e 20", amount: 412_000, tone: "danger" as const },
              { label: "Impostos federais", when: "Dia 20", amount: 168_400, tone: "warning" as const },
              { label: "Cloud e infraestrutura", when: "Dia 12", amount: 74_900, tone: "neutral" as const },
              { label: "Aluguel Edifício Lumen", when: "Dia 10", amount: 38_200, tone: "neutral" as const },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.when}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular text-foreground">
                    {formatCurrency(item.amount, currency, { maximumFractionDigits: 0 })}
                  </span>
                  <Badge variant={item.tone}>Recorrente</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function AccountRow({ account }: { account: Account }) {
  const { currency } = usePreferences();
  const Icon = ACCOUNT_ICON[account.kind] ?? Building2;
  const negative = account.balance < 0;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised/50 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand" aria-hidden>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{account.label}</p>
          <p className="truncate text-xs text-muted-foreground">{account.institution}</p>
        </div>
      </div>
      <span className={`text-sm font-semibold tabular ${negative ? "text-danger" : "text-foreground"}`}>
        {formatCurrency(account.balance, currency, { maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}
