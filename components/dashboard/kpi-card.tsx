"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Delta } from "@/components/common/delta";
import { Sparkline } from "@/components/charts/sparkline";
import { usePreferences } from "@/components/providers";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Kpi } from "@/types";

function renderValue(kpi: Kpi, currency: ReturnType<typeof usePreferences>["currency"], compact: boolean) {
  if (kpi.format === "percent") return formatPercent(kpi.value);
  if (kpi.format === "number") return kpi.value.toFixed(0);
  return compact
    ? formatCompact(kpi.value, currency)
    : formatCurrency(kpi.value, currency, { maximumFractionDigits: 0 });
}

export function KpiCard({ kpi, comparisonLabel }: { kpi: Kpi; comparisonLabel: string }) {
  const { currency, compactNumbers } = usePreferences();

  return (
    <Card className="group overflow-hidden hover:border-brand/40">
      <div className="flex items-start justify-between gap-3 p-5 pb-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{kpi.label}</p>
          <p className="tabular mt-1.5 text-kpi font-semibold text-foreground">
            {renderValue(kpi, currency, compactNumbers)}
          </p>
        </div>
        <span
          className="mt-0.5 size-2.5 shrink-0 rounded-full"
          style={{ background: `hsl(var(${kpi.colorVar}))` }}
          aria-hidden
        />
      </div>

      <div className="flex items-center gap-2 px-5 pb-2">
        <Delta value={kpi.change} inverse={kpi.inverse} />
        <span className="truncate text-[11px] text-subtle">{comparisonLabel}</span>
      </div>

      <div className="-mb-px px-1">
        <Sparkline data={kpi.spark} colorVar={kpi.colorVar} />
      </div>

      <span className="sr-only">{kpi.hint}</span>
    </Card>
  );
}

export function KpiCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="space-y-3 p-5 pb-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-20 rounded-full" />
      </div>
      <Skeleton className="mx-1 mb-1 h-11 rounded-md" />
    </Card>
  );
}
