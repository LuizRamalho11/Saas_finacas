"use client";

import type { TooltipProps } from "recharts";
import { cn } from "@/lib/utils";

interface ChartTooltipProps extends TooltipProps<number, string> {
  /** Formata o valor de cada série. */
  formatValue: (value: number) => string;
  /** Formata o rótulo (eixo X). */
  formatLabel?: (label: string) => string;
  /** Oculta séries auxiliares (ex.: linhas de emenda). */
  hide?: string[];
  footer?: (payload: { name?: string; value?: number }[]) => React.ReactNode;
}

/** Tooltip compartilhado por todos os gráficos — mesma moldura, mesmo espaçamento. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  formatLabel,
  hide = [],
  footer,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const rows = payload.filter(
    (entry) => !hide.includes(String(entry.dataKey)) && entry.value !== null && entry.value !== undefined,
  );
  if (!rows.length) return null;

  return (
    <div className="min-w-[10rem] rounded-lg border border-border bg-surface/95 p-3 shadow-pop backdrop-blur">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">
        {formatLabel ? formatLabel(String(label)) : String(label)}
      </p>
      <ul className="space-y-1.5">
        {rows.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                className={cn("size-2 rounded-full")}
                style={{ background: entry.color ?? entry.stroke }}
                aria-hidden
              />
              {entry.name}
            </span>
            <span className="tabular font-semibold text-foreground">{formatValue(Number(entry.value))}</span>
          </li>
        ))}
      </ul>
      {footer ? (
        <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">{footer(rows)}</div>
      ) : null}
    </div>
  );
}
