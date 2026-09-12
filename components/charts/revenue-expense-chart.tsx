"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { usePreferences } from "@/components/providers";
import { formatCompact, formatCurrency, formatDayShort } from "@/lib/format";
import type { DailyPoint } from "@/types";

const AXIS = {
  stroke: "hsl(var(--border))",
  tick: { fill: "hsl(var(--fg-subtle))", fontSize: 11 },
};

export function RevenueExpenseChart({ data, height = 300 }: { data: DailyPoint[]; height?: number | string }) {
  const { currency } = usePreferences();
  const revenueId = useId();
  const expenseId = useId();

  return (
    <div className="h-full w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={revenueId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--chart-1) / 0.45)" />
              <stop offset="100%" stopColor="hsl(var(--chart-1) / 0)" />
            </linearGradient>
            <linearGradient id={expenseId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--chart-4) / 0.35)" />
              <stop offset="100%" stopColor="hsl(var(--chart-4) / 0)" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} opacity={0.7} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDayShort}
            tickLine={false}
            axisLine={false}
            tick={AXIS.tick}
            minTickGap={28}
            dy={8}
          />
          <YAxis
            tickFormatter={(value) => formatCompact(Number(value), currency)}
            tickLine={false}
            axisLine={false}
            tick={AXIS.tick}
            width={84}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--brand) / 0.5)", strokeWidth: 1, strokeDasharray: "4 4" }}
            content={
              <ChartTooltip
                formatValue={(value) => formatCurrency(value, currency, { maximumFractionDigits: 0 })}
                formatLabel={formatDayShort}
                footer={(rows) => {
                  const revenue = rows.find((r) => r.name === "Receita")?.value ?? 0;
                  const expense = rows.find((r) => r.name === "Despesa")?.value ?? 0;
                  return `Resultado: ${formatCurrency(revenue - expense, currency, { maximumFractionDigits: 0 })}`;
                }}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="revenue"
            name="Receita"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2.5}
            fill={`url(#${revenueId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--surface))" }}
          />
          <Area
            type="monotone"
            dataKey="expense"
            name="Despesa"
            stroke="hsl(var(--chart-4))"
            strokeWidth={2.5}
            fill={`url(#${expenseId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--surface))" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
