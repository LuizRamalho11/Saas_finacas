"use client";

import { ArrowDownLeft, ArrowUpRight, Inbox, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "./status-badge";
import { usePreferences } from "@/components/providers";
import { formatCurrency, formatDateCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/types";

interface TransactionsTableProps {
  rows: Transaction[];
  loading?: boolean;
  /** Oculta colunas secundárias no card do dashboard. */
  dense?: boolean;
  skeletonRows?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (transaction: Transaction) => void;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
}

export function TransactionsTable({
  rows,
  loading = false,
  dense = false,
  skeletonRows = 6,
  emptyTitle = "Nenhum lançamento encontrado",
  emptyDescription = "Ajuste os filtros ou amplie o período para ver movimentações desta conta.",
  emptyAction,
  onRowClick,
  onEdit,
  onDelete,
}: TransactionsTableProps) {
  const hasActions = Boolean(onEdit || onDelete);

  if (loading) {
    return (
      <div className="space-y-1 px-5 pb-4">
        {Array.from({ length: skeletonRows }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 py-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-2.5 w-1/4" />
            </div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="p-5 pt-0">
        <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Descrição</TableHead>
          {!dense && <TableHead>Data</TableHead>}
          <TableHead>Categoria</TableHead>
          {!dense && <TableHead>Conta</TableHead>}
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="text-right">Status</TableHead>
          {hasActions && (
            <TableHead className="w-10 text-right">
              <span className="sr-only">Ações</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((tx) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            dense={dense}
            onRowClick={onRowClick}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function TransactionRow({
  tx,
  dense,
  onRowClick,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  dense: boolean;
  onRowClick?: (transaction: Transaction) => void;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
}) {
  const { currency } = usePreferences();
  const income = tx.type === "income";
  const Icon = income ? ArrowDownLeft : ArrowUpRight;
  const hasActions = Boolean(onEdit || onDelete);
  const clickable = Boolean(onRowClick);

  return (
    <TableRow
      className={cn(clickable && "cursor-pointer", tx.status === "canceled" && "opacity-65")}
      onClick={clickable ? () => onRowClick?.(tx) : undefined}
      // A linha inteira abre o detalhe; como <tr> não é focável por padrão,
      // damos tabindex e tratamos Enter/Espaço para quem navega por teclado.
      tabIndex={clickable ? 0 : undefined}
      role={clickable ? "button" : undefined}
      aria-label={clickable ? `Ver detalhes de ${tx.description}` : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onRowClick?.(tx);
              }
            }
          : undefined
      }
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              income ? "bg-success/12 text-success" : "bg-coral/12 text-coral",
            )}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 max-w-[16rem] lg:max-w-[22rem]">
            <p className="truncate text-sm font-medium text-foreground">{tx.description}</p>
            <p className="truncate text-xs text-muted-foreground">
              {dense ? formatDateCompact(tx.date) : tx.counterparty || tx.method || "—"}
              <span className="sr-only">{income ? " — entrada" : " — saída"}</span>
            </p>
          </div>
        </div>
      </TableCell>
      {!dense && (
        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDateCompact(tx.date)}</TableCell>
      )}
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          {tx.categoryColor ? (
            <span className="size-2 shrink-0 rounded-full" style={{ background: tx.categoryColor }} aria-hidden />
          ) : null}
          {tx.categoryLabel}
        </span>
      </TableCell>
      {!dense && <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{tx.accountLabel}</TableCell>}
      <TableCell
        className={cn(
          "tabular whitespace-nowrap text-right text-sm font-semibold",
          income ? "text-success" : "text-foreground",
          tx.status === "canceled" && "line-through",
        )}
      >
        {income ? "+" : "−"}
        {formatCurrency(tx.amount, currency)}
      </TableCell>
      <TableCell className="text-right">
        <StatusBadge status={tx.status} />
      </TableCell>
      {hasActions && (
        <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Ações para ${tx.description}`}>
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit ? (
                <DropdownMenuItem onSelect={() => onEdit(tx)}>
                  <Pencil aria-hidden /> Editar
                </DropdownMenuItem>
              ) : null}
              {onDelete ? (
                <DropdownMenuItem onSelect={() => onDelete(tx)} className="text-danger focus:text-danger">
                  <Trash2 aria-hidden /> Excluir
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      )}
    </TableRow>
  );
}
