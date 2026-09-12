import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";

interface DeltaProps {
  value: number;
  /** Quando true, uma queda é positiva (ex.: despesas). */
  inverse?: boolean;
  className?: string;
  suffix?: string;
}

/** Micro-indicador de variação: seta + percentual, verde/vermelho. */
export function Delta({ value, inverse = false, className, suffix }: DeltaProps) {
  const flat = Math.abs(value) < 0.05;
  const positive = inverse ? value < 0 : value > 0;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium",
        flat && "bg-surface-raised text-muted-foreground",
        !flat && positive && "bg-success/12 text-success",
        !flat && !positive && "bg-danger/12 text-danger",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span>{formatPercent(value)}</span>
      {suffix ? <span className="font-normal text-muted-foreground">{suffix}</span> : null}
    </span>
  );
}
