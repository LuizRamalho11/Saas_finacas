"use client";

import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { usePreferences } from "@/components/providers";
import { formatCompact, formatCurrency, formatDayShort } from "@/lib/format";
import type { CashFlowPoint } from "@/types";

interface CashFlowChartProps {
  data: CashFlowPoint[];
  /** ISO do dia de hoje, para marcar a divisa realizado/projetado. */
  todayIso: string;
  height?: number | string;
}

/** Linha sólida = saldo realizado; linha tracejada = projeção. */
export function CashFlowChart({ data, todayIso, height = 340 }: CashFlowChartProps) {
  const { currency } = usePreferences();
  const areaId = useId();

  const marker = data.find((point) => point.date >= todayIso)?.date ?? todayIso;

  return (
    <div className="h-full w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--chart-2) / 0.32)" />
              <stop offset="100%" stopColor="hsl(var(--chart-2) / 0)" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} opacity={0.7} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDayShort}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--fg-subtle))", fontSize: 11 }}
            minTickGap={32}
            dy={8}
          />
          <YAxis
            tickFormatter={(value) => formatCompact(Number(value), currency)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--fg-subtle))", fontSize: 11 }}
            width={76}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--brand) / 0.5)", strokeWidth: 1, strokeDasharray: "4 4" }}
            content={
              <ChartTooltip
                formatValue={(value) => formatCurrency(value, currency, { maximumFractionDigits: 0 })}
                formatLabel={formatDayShort}
              />
            }
          />
          <ReferenceLine
            x={marker}
            stroke="hsl(var(--fg-subtle))"
            strokeDasharray="3 3"
            label={{
              value: "hoje",
              position: "insideTopRight",
              fill: "hsl(var(--fg-subtle))",
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="actual"
            name="Saldo realizado"
            stroke="hsl(var(--chart-2))"
            strokeWidth={2.5}
            fill={`url(#${areaId})`}
            connectNulls={false}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--surface))" }}
          />
          <Line
            type="monotone"
            dataKey="projected"
            name="Projeção"
            stroke="hsl(var(--chart-3))"
            strokeWidth={2.5}
            strokeDasharray="6 5"
            connectNulls
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--surface))" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
