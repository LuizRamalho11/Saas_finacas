import { cn } from "@/lib/utils";

/** Marca do produto: monograma em gradiente + wordmark. */
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand via-brand to-violet text-sm font-bold text-white shadow-glow"
        aria-hidden
      >
        F
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight text-foreground">Finora</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-subtle">Finance OS</span>
        </span>
      )}
    </span>
  );
}
