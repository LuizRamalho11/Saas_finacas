"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteTransaction, restoreTransaction } from "@/lib/actions/transactions";
import { usePreferences } from "@/components/providers";
import { formatCurrency, formatDateFull } from "@/lib/format";
import type { Transaction } from "@/types";

interface DeleteTransactionDialogProps {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

/**
 * Exclusão em duas etapas: confirmação explícita e, depois, uma janela de
 * desfazer no toast — a linha é recriada com os mesmos dados se o usuário voltar atrás.
 */
export function DeleteTransactionDialog({ transaction, open, onOpenChange, onDeleted }: DeleteTransactionDialogProps) {
  const router = useRouter();
  const { currency } = usePreferences();
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    if (!transaction) return;
    setDeleting(true);
    const result = await deleteTransaction(transaction.id);
    setDeleting(false);
    onOpenChange(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    onDeleted?.();
    router.refresh();

    const snapshot = result.data.restore;
    toast.success("Transação excluída.", {
      duration: 8000,
      action: snapshot
        ? {
            label: "Desfazer",
            onClick: async () => {
              const restored = await restoreTransaction(snapshot);
              if (restored.ok) {
                toast.success("Transação restaurada.");
                onDeleted?.();
                router.refresh();
              } else {
                toast.error(restored.error);
              }
            },
          }
        : undefined,
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Excluir esta transação?</AlertDialogTitle>
        <AlertDialogDescription>
          {transaction ? (
            <>
              <span className="block font-medium text-foreground">{transaction.description}</span>
              <span className="mt-1 block">
                {formatCurrency(transaction.amount, currency)} · {formatDateFull(transaction.date)}
              </span>
              <span className="mt-2 block">
                Os indicadores do período serão recalculados. Você poderá desfazer por alguns segundos.
              </span>
            </>
          ) : null}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
            disabled={deleting}
          >
            {deleting ? "Excluindo…" : "Excluir transação"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
