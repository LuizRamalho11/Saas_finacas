import { cn } from "@/lib/utils";

/** Placeholder de carregamento com brilho deslizante. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden className={cn("relative overflow-hidden rounded-md bg-surface-raised", className)} {...props}>
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />
    </div>
  );
}
