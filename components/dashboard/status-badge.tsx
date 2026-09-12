import { Badge } from "@/components/ui/badge";
import type { TransactionStatus } from "@/types";

const STATUS_MAP: Record<TransactionStatus, { label: string; variant: "success" | "warning" | "neutral" }> = {
  completed: { label: "Concluída", variant: "success" },
  pending: { label: "Pendente", variant: "warning" },
  canceled: { label: "Cancelada", variant: "neutral" },
};

export const STATUS_OPTIONS = (Object.keys(STATUS_MAP) as TransactionStatus[]).map((value) => ({
  value,
  label: STATUS_MAP[value].label,
}));

export function StatusBadge({ status }: { status: TransactionStatus }) {
  const config = STATUS_MAP[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
