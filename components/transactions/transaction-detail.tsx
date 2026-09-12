"use client";

import { ArrowDownLeft, ArrowUpRight, Pencil, Trash2 } from "lucide-react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { usePreferences } from "@/components/providers";
import { formatCurrency, formatDateFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/types";

interface TransactionDetailProps {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

export function TransactionDetail({ transaction, open, onOpenChange, onEdit, onDelete }: TransactionDetailProps) {
  const { currency } = usePreferences();
  if (!transaction) return null;

  const income = transaction.type === "income";
  const Icon = income ? ArrowDownLeft : ArrowUpRight;
  const edited = transaction.createdAt !== transaction.updatedAt;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent title="Detalhe da transação" description={transaction.description}>
        <div className="space-y-6 p-5">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                income ? "bg-success/12 text-success" : "bg-coral/12 text-coral",
              )}
              aria-hidden
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{transaction.description}</p>
              <p className="text-xs text-muted-foreground">{formatDateFull(transaction.date)}</p>
            </div>
            <StatusBadge status={transaction.status} />
          </div>

          <div className="rounded-card border border-border bg-surface-raised/50 p-4">
            <p className="text-xs text-muted-foreground">{income ? "Entrada" : "Saída"}</p>
            <p className={cn("tabular mt-1 text-2xl font-semibold", income ? "text-success" : "text-foreground")}>
              {income ? "+" : "−"}
              {formatCurrency(transaction.amount, currency)}
            </p>
          </div>

          <dl className="space-y-3 text-sm">
            <Row label="Categoria">
              <span className="flex items-center gap-2">
                {transaction.categoryColor ? (
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: transaction.categoryColor }}
                    aria-hidden
                  />
                ) : null}
                {transaction.categoryLabel}
              </span>
            </Row>
            <Row label="Conta">{transaction.accountLabel}</Row>
            <Row label="Cliente / fornecedor">{transaction.counterparty || "—"}</Row>
            <Row label="Método">{transaction.method || "—"}</Row>
            <Row label="Identificador">
              <span className="font-mono text-xs">{transaction.id}</span>
            </Row>
          </dl>

          {transaction.notes ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-subtle">Observações</p>
              <p className="rounded-lg border border-border bg-surface-raised/50 p-3 text-sm text-muted-foreground">
                {transaction.notes}
              </p>
            </div>
          ) : null}

          {/* Histórico de alterações pedido no detalhe */}
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-subtle">Histórico</p>
            <ol className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                <span>Criada em {formatDateTime(transaction.createdAt)}</span>
              </li>
              <li className="flex items-start gap-2">
                <span
                  className={cn("mt-1 size-1.5 shrink-0 rounded-full", edited ? "bg-warning" : "bg-border")}
                  aria-hidden
                />
                <span>
                  {edited
                    ? `Última alteração em ${formatDateTime(transaction.updatedAt)}`
                    : "Nunca editada desde a criação"}
                </span>
              </li>
            </ol>
          </div>

          <div className="flex gap-2 border-t border-border pt-4">
            <Button className="flex-1" onClick={() => onEdit(transaction)}>
              <Pencil aria-hidden /> Editar
            </Button>
            <Button variant="danger" onClick={() => onDelete(transaction)}>
              <Trash2 aria-hidden /> Excluir
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{children}</dd>
    </div>
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
