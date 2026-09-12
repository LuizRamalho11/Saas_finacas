"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { usePreferences } from "@/components/providers";
import { formatCompact, formatCurrency } from "@/lib/format";
import type { CategorySlice } from "@/types";

/** Barras verticais para comparar despesas por categoria. */
export function CategoryBarChart({ data, height = 260 }: { data: CategorySlice[]; height?: number | string }) {
  const { currency } = usePreferences();

  return (
    <div className="h-full w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} barCategoryGap="28%">
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} opacity={0.7} />
          <XAxis
            dataKey="short"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--fg-subtle))", fontSize: 11 }}
            dy={8}
            minTickGap={4}
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
                formatLabel={(short) => data.find((d) => d.short === short)?.label ?? short}
                footer={(rows) => {
                  const slice = data.find((d) => d.amount === rows[0]?.value);
                  return slice ? `${(slice.share * 100).toFixed(1).replace(".", ",")}% das despesas do período` : null;
                }}
              />
            }
          />
          <Bar dataKey="amount" isAnimationActive={false} name="Despesa" radius={[6, 6, 4, 4]} maxBarSize={44}>
            {data.map((slice) => (
              <Cell key={slice.id} fill={slice.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
