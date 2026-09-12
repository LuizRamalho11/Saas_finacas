import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Esqueleto que imita a silhueta de um gráfico, não um bloco cinza qualquer. */
export function ChartSkeleton({
  height,
  bars = 12,
  className,
}: {
  height?: number;
  bars?: number;
  className?: string;
}) {
  const heights = [42, 68, 55, 80, 62, 91, 48, 74, 58, 86, 66, 52, 78, 60];

  return (
    <div className={cn("flex items-end gap-2", className)} style={height ? { height } : undefined} aria-hidden>
      {Array.from({ length: bars }).map((_, index) => (
        <Skeleton
          key={index}
          className="flex-1 rounded-t-md"
          style={{ height: `${heights[index % heights.length]}%` }}
        />
      ))}
    </div>
  );
}
