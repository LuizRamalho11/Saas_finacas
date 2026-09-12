"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { usePreferences } from "@/components/providers";
import { formatCompact, formatCurrency, formatMonthShort } from "@/lib/format";

export interface CompareRow {
  month: string;
  current: number;
  previous: number;
}

/** Comparativo mês a mês: ano corrente vs. mesmo mês do ano anterior. */
export function MonthlyCompareChart({
  data,
  colorVar,
  height = 320,
}: {
  data: CompareRow[];
  colorVar: string;
  height?: number | string;
}) {
  const { currency } = usePreferences();

  return (
    <div className="h-full w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} barGap={4}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} opacity={0.7} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthShort}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--fg-subtle))", fontSize: 11 }}
            dy={8}
          />
          <YAxis
            tickFormatter={(value) => formatCompact(Number(value), currency)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--fg-subtle))", fontSize: 11 }}
            width={86}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--surface-2) / 0.6)" }}
            content={
              <ChartTooltip
                formatValue={(value) => formatCurrency(value, currency, { maximumFractionDigits: 0 })}
                formatLabel={formatMonthShort}
                footer={(rows) => {
                  const current = rows.find((r) => r.name?.includes("Atual"))?.value ?? 0;
                  const previous = rows.find((r) => r.name?.includes("anterior"))?.value ?? 0;
                  if (!previous) return null;
                  const diff = ((current - previous) / Math.abs(previous)) * 100;
                  return `${diff >= 0 ? "+" : ""}${diff.toFixed(1).replace(".", ",")}% vs. ano anterior`;
                }}
              />
            }
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={32}
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
          />
          <Bar
            dataKey="previous"
            isAnimationActive={false}
            name="Ano anterior"
            fill="hsl(var(--fg-subtle) / 0.32)"
            radius={[6, 6, 4, 4]}
            maxBarSize={26}
          />
          <Bar
            dataKey="current"
            isAnimationActive={false}
            name="Período atual"
            fill={`hsl(var(${colorVar}))`}
            radius={[6, 6, 4, 4]}
            maxBarSize={26}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
