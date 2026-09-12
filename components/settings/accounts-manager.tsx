"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Landmark, Loader2, Pencil, PiggyBank, Plus, Trash2, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { usePreferences } from "@/components/providers";
import { createAccount, deleteAccount, listAccounts, updateAccount } from "@/lib/actions/accounts";
import { formatCurrency } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import { cn } from "@/lib/utils";
import type { AccountRecord } from "@/types";

const ACCOUNT_TYPES = [
  { value: "checking", label: "Conta corrente", icon: Landmark },
  { value: "savings", label: "Poupança / reserva", icon: PiggyBank },
  { value: "credit_card", label: "Cartão de crédito", icon: CreditCard },
  { value: "investment", label: "Investimento", icon: TrendingUp },
] as const;

const iconFor = (type: string) => ACCOUNT_TYPES.find((item) => item.value === type)?.icon ?? Wallet;
const labelFor = (type: string) => ACCOUNT_TYPES.find((item) => item.value === type)?.label ?? "Conta";

export function AccountsManager() {
  const router = useRouter();
  const { currency } = usePreferences();
  const [revision, setRevision] = React.useState(0);
  const refresh = () => {
    setRevision((value) => value + 1);
    router.refresh();
  };

  const { data, loading } = useAsync(() => listAccounts(), [revision]);
  const accounts = data ?? [];

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AccountRecord | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AccountRecord | null>(null);

  const totalBalance = accounts.reduce((acc, account) => acc + account.balance, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Contas financeiras</CardTitle>
            <CardDescription>
              O saldo é derivado: saldo inicial mais todos os lançamentos não cancelados da conta.
            </CardDescription>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden /> Nova conta
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-lg" />)
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Nenhuma conta cadastrada"
              description="Cadastre a primeira conta para poder lançar receitas e despesas."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus aria-hidden /> Criar primeira conta
                </Button>
              }
            />
          ) : (
            <>
              {accounts.map((account) => {
                const Icon = iconFor(account.type);
                return (
                  <div
                    key={account.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-raised/50 px-4 py-3"
                  >
                    <span
                      className="bg-brand/12 flex size-9 shrink-0 items-center justify-center rounded-lg text-brand"
                      aria-hidden
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{account.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {labelFor(account.type)}
                        {account.institution ? ` · ${account.institution}` : ""} · {account.transactionCount} lançamento
                        {account.transactionCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "tabular text-sm font-semibold",
                        account.balance < 0 ? "text-danger" : "text-foreground",
                      )}
                    >
                      {formatCurrency(account.balance, currency, { maximumFractionDigits: 0 })}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar ${account.name}`}
                        onClick={() => {
                          setEditing(account);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir ${account.name}`}
                        className="text-muted-foreground hover:text-danger"
                        onClick={() => setPendingDelete(account)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">Saldo consolidado</span>
                <span className="tabular font-semibold text-foreground">
                  {formatCurrency(totalBalance, currency, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AccountForm open={formOpen} onOpenChange={setFormOpen} account={editing} onSaved={refresh} />

      <DeleteAccountDialog
        account={pendingDelete}
        accounts={accounts}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onDeleted={refresh}
      />
    </div>
  );
}

function AccountForm({
  open,
  onOpenChange,
  account,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountRecord | null;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState({ name: "", type: "checking", institution: "", openingBalance: "0" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({
      name: account?.name ?? "",
      type: account?.type ?? "checking",
      institution: account?.institution ?? "",
      openingBalance: (account?.openingBalance ?? 0).toFixed(2).replace(".", ","),
    });
  }, [open, account]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const result = account ? await updateAccount({ id: account.id, data: form }) : await createAccount(form);
    setSaving(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? "Conta salva.");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title={account ? "Editar conta" : "Nova conta"}
        description="O saldo inicial é o ponto de partida do fluxo de caixa."
      >
        <form onSubmit={handleSubmit} className="space-y-5 p-5" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="account-name">Nome</Label>
            <Input
              id="account-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ex.: Conta Principal"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? (
              <p role="alert" className="text-xs text-danger">
                {errors.name}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-type">Tipo</Label>
            <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value })}>
              <SelectTrigger id="account-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-institution">Instituição</Label>
            <Input
              id="account-institution"
              value={form.institution}
              onChange={(event) => setForm({ ...form, institution: event.target.value })}
              placeholder="Ex.: Banco Aurora"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-opening">Saldo inicial (R$)</Label>
            <Input
              id="account-opening"
              inputMode="decimal"
              value={form.openingBalance}
              onChange={(event) => setForm({ ...form, openingBalance: event.target.value })}
              aria-invalid={Boolean(errors.openingBalance)}
            />
            {errors.openingBalance ? (
              <p role="alert" className="text-xs text-danger">
                {errors.openingBalance}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Aceita valor negativo, útil para faturas de cartão em aberto.
              </p>
            )}
          </div>

          <div className="flex gap-2 border-t border-border pt-4">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {saving ? "Salvando…" : account ? "Salvar alterações" : "Criar conta"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function DeleteAccountDialog({
  account,
  accounts,
  onOpenChange,
  onDeleted,
}: {
  account: AccountRecord | null;
  accounts: AccountRecord[];
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [reassignTo, setReassignTo] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => setReassignTo(""), [account]);

  if (!account) return null;

  const targets = accounts.filter((item) => item.id !== account.id);
  const needsReassign = account.transactionCount > 0;

  async function handleDelete() {
    if (!account) return;
    if (needsReassign && !reassignTo) {
      toast.error("Escolha uma conta de destino para os lançamentos.");
      return;
    }

    setDeleting(true);
    const result = await deleteAccount({ id: account.id, reassignToId: reassignTo || undefined });
    setDeleting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? "Conta excluída.");
    onOpenChange(false);
    onDeleted();
  }

  return (
    <AlertDialog open={Boolean(account)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Excluir “{account.name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          {needsReassign
            ? `Esta conta tem ${account.transactionCount} lançamento(s). Escolha para onde movê-los — nenhuma transação será apagada.`
            : "Nenhum lançamento usa esta conta. A exclusão é imediata."}
        </AlertDialogDescription>

        {needsReassign ? (
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="reassign-account">Mover lançamentos para</Label>
            {targets.length ? (
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger id="reassign-account">
                  <SelectValue placeholder="Selecione a conta de destino" />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((target) => (
                    <SelectItem key={target.id} value={target.id}>
                      {target.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-danger">Não há outra conta para receber os lançamentos.</p>
            )}
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
            disabled={deleting || (needsReassign && !targets.length)}
          >
            {deleting ? "Excluindo…" : "Excluir conta"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
