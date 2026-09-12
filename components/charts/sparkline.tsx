"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useId } from "react";

interface SparklineProps {
  data: { date: string; value: number }[];
  colorVar: string;
  height?: number;
}

/** Mini-gráfico dos cards de KPI — sem eixos, só a silhueta da tendência. */
export function Sparkline({ data, colorVar, height = 44 }: SparklineProps) {
  const gradientId = useId();

  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`hsl(var(${colorVar}) / 0.35)`} />
              <stop offset="100%" stopColor={`hsl(var(${colorVar}) / 0)`} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={`hsl(var(${colorVar}))`}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
