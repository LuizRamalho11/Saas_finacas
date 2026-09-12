"use client";

import * as React from "react";
import { CalendarRange, Download, FileText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonthlyCompareChart, type CompareRow } from "@/components/charts/monthly-compare-chart";
import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { SectionHeading } from "@/components/common/section-heading";
import { Delta } from "@/components/common/delta";
import { usePreferences } from "@/components/providers";
import { useAsync } from "@/lib/use-async";
import { getMonthlySeries } from "@/lib/api";
import { formatCurrency, formatMonthShort } from "@/lib/format";
import type { MonthlyPoint } from "@/types";

type View = "revenue" | "expense" | "profit";

const VIEWS: { value: View; label: string; colorVar: string; description: string }[] = [
  { value: "revenue", label: "Receita", colorVar: "--chart-1", description: "Receita bruta reconhecida por mês" },
  { value: "expense", label: "Despesas", colorVar: "--chart-4", description: "Saídas consolidadas por mês" },
  { value: "profit", label: "Lucro", colorVar: "--chart-2", description: "Resultado líquido mês a mês" },
];

export default function ReportsPage() {
  const [view, setView] = React.useState<View>("revenue");
  const { currency } = usePreferences();
  const monthly = useAsync(() => getMonthlySeries(24), []);

  const config = VIEWS.find((item) => item.value === view)!;
  const series = monthly.data ?? [];

  /** Últimos 12 meses ao lado do mesmo mês do ano anterior. */
  const compare: CompareRow[] = React.useMemo(() => {
    if (series.length < 13) return [];
    const recent = series.slice(-12);
    return recent.map((point, index) => {
      const previous = series[series.length - 12 - 12 + index] ?? series[0];
      return {
        month: point.month,
        current: point[view],
        previous: previous[view],
      };
    });
  }, [series, view]);

  const totalCurrent = compare.reduce((acc, row) => acc + row.current, 0);
  const totalPrevious = compare.reduce((acc, row) => acc + row.previous, 0);
  const yoy = totalPrevious ? ((totalCurrent - totalPrevious) / Math.abs(totalPrevious)) * 100 : 0;

  // O mês corrente ainda está em curso: entra no total, mas não disputa melhor/pior mês.
  const closedMonths = compare.slice(0, -1);
  const best = closedMonths.reduce<CompareRow | null>(
    (acc, row) => (!acc || row.current > acc.current ? row : acc),
    null,
  );
  const worst = closedMonths.reduce<CompareRow | null>(
    (acc, row) => (!acc || row.current < acc.current ? row : acc),
    null,
  );

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Comparativo anual"
        description="Comparativos mês a mês e ano a ano, com exportação para o fechamento contábil."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={view} onValueChange={(value) => setView(value as View)}>
              <TabsList aria-label="Alternar visão do relatório">
                {VIEWS.map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button variant="secondary" size="sm">
              <Download aria-hidden /> Exportar
            </Button>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: `${config.label} — 12 meses`, value: totalCurrent, delta: yoy, caption: "vs. 12 meses anteriores" },
          { label: "Mesmo período do ano anterior", value: totalPrevious, delta: null, caption: "Base comparativa" },
          {
            label: "Melhor mês",
            value: best?.current ?? 0,
            delta: null,
            caption: best ? `${formatMonthShort(best.month)} · meses fechados` : "—",
          },
          {
            label: "Pior mês",
            value: worst?.current ?? 0,
            delta: null,
            caption: worst ? `${formatMonthShort(worst.month)} · meses fechados` : "—",
          },
        ].map((item) => (
          <Card key={item.label} className="p-5">
            <p className="truncate text-xs font-medium text-muted-foreground">{item.label}</p>
            {monthly.loading ? (
              <Skeleton className="mt-2 h-7 w-32" />
            ) : (
              <p className="mt-1.5 text-kpi font-semibold tabular text-foreground">
                {formatCurrency(item.value, currency, { maximumFractionDigits: 0 })}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              {item.delta !== null && !monthly.loading ? <Delta value={item.delta} /> : null}
              <span className="truncate text-[11px] text-subtle">{item.caption}</span>
            </div>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{config.label} — ano a ano</CardTitle>
            <CardDescription>{config.description}</CardDescription>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="size-4" aria-hidden /> Últimos 12 meses
          </span>
        </CardHeader>
        <CardContent>
          {monthly.loading || !compare.length ? (
            <ChartSkeleton height={320} bars={12} />
          ) : (
            <MonthlyCompareChart data={compare} colorVar={config.colorVar} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Fechamento mensal</CardTitle>
            <CardDescription>Receita, despesa, resultado e margem por mês</CardDescription>
          </div>
          <Button variant="ghost" size="sm">
            <FileText aria-hidden /> Gerar PDF
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          {monthly.loading || !series.length ? (
            <div className="space-y-2 px-5 pb-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-10 rounded-md" />
              ))}
            </div>
          ) : (
            <MonthlyTable rows={series.slice(-12).reverse()} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MonthlyTable({ rows }: { rows: MonthlyPoint[] }) {
  const { currency } = usePreferences();

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Mês</TableHead>
          <TableHead className="text-right">Receita</TableHead>
          <TableHead className="text-right">Despesa</TableHead>
          <TableHead className="text-right">Resultado</TableHead>
          <TableHead className="text-right">Margem</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const margin = row.revenue ? (row.profit / row.revenue) * 100 : 0;
          return (
            <TableRow key={row.month}>
              <TableCell className="whitespace-nowrap text-sm font-medium text-foreground">
                {formatMonthShort(row.month)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right text-sm tabular text-muted-foreground">
                {formatCurrency(row.revenue, currency, { maximumFractionDigits: 0 })}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right text-sm tabular text-muted-foreground">
                {formatCurrency(row.expense, currency, { maximumFractionDigits: 0 })}
              </TableCell>
              <TableCell
                className={`whitespace-nowrap text-right text-sm font-semibold tabular ${
                  row.profit >= 0 ? "text-foreground" : "text-danger"
                }`}
              >
                {formatCurrency(row.profit, currency, { maximumFractionDigits: 0 })}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right">
                <span className="text-sm tabular text-muted-foreground">
                  {margin.toFixed(1).replace(".", ",")}%
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
