"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTransaction, updateTransaction } from "@/lib/actions/transactions";
import { localTodayIso } from "@/lib/periods";
import { cn } from "@/lib/utils";
import type { AccountRecord, CategoryRecord, Transaction, TransactionType } from "@/types";

const STATUS_OPTIONS = [
  { value: "completed", label: "Concluída" },
  { value: "pending", label: "Pendente" },
  { value: "canceled", label: "Cancelada" },
];

const METHOD_OPTIONS = ["Pix", "Boleto", "TED", "Cartão corporativo", "Débito automático", "Dinheiro"];

interface FormState {
  description: string;
  counterparty: string;
  amount: string;
  type: TransactionType;
  status: string;
  categoryId: string;
  accountId: string;
  date: string;
  method: string;
  notes: string;
}

function emptyState(accountId: string): FormState {
  return {
    description: "",
    counterparty: "",
    amount: "",
    type: "expense",
    status: "completed",
    categoryId: "",
    accountId,
    date: localTodayIso(),
    method: "",
    notes: "",
  };
}

function stateFrom(transaction: Transaction): FormState {
  return {
    description: transaction.description,
    counterparty: transaction.counterparty,
    amount: transaction.amount.toFixed(2).replace(".", ","),
    type: transaction.type,
    status: transaction.status,
    categoryId: transaction.categoryId,
    accountId: transaction.accountId,
    date: transaction.date,
    method: transaction.method,
    notes: transaction.notes ?? "",
  };
}

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryRecord[];
  accounts: AccountRecord[];
  /** Ausente = criação; presente = edição. */
  transaction?: Transaction | null;
  onSaved?: () => void;
}

export function TransactionForm({
  open,
  onOpenChange,
  categories,
  accounts,
  transaction,
  onSaved,
}: TransactionFormProps) {
  const router = useRouter();
  const editing = Boolean(transaction);
  const [form, setForm] = React.useState<FormState>(() => emptyState(accounts[0]?.id ?? ""));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  // Reabrir o painel sempre parte de um estado limpo (ou do registro em edição).
  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(transaction ? stateFrom(transaction) : emptyState(accounts[0]?.id ?? ""));
  }, [open, transaction, accounts]);

  const availableCategories = categories.filter((category) => category.type === form.type);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function changeType(type: TransactionType) {
    setForm((current) => ({
      ...current,
      type,
      // A categoria antiga pode ser do outro tipo: limpamos para forçar a escolha.
      categoryId: categories.some((c) => c.id === current.categoryId && c.type === type) ? current.categoryId : "",
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload = {
      description: form.description,
      counterparty: form.counterparty,
      amount: form.amount,
      type: form.type,
      status: form.status,
      categoryId: form.categoryId,
      accountId: form.accountId,
      date: form.date,
      method: form.method,
      notes: form.notes,
    };

    const result = transaction ? await updateTransaction(transaction.id, payload) : await createTransaction(payload);

    setSaving(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? "Transação salva.");
    onOpenChange(false);
    onSaved?.();
    router.refresh();
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title={editing ? "Editar transação" : "Nova transação"}
        description={
          editing
            ? "As alterações refletem nos KPIs assim que você salvar."
            : "O lançamento entra imediatamente nos indicadores do período."
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5 p-5" noValidate>
          {/* Tipo define quais categorias aparecem abaixo */}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo do lançamento">
            {(["expense", "income"] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={form.type === type}
                onClick={() => changeType(type)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                  form.type === type
                    ? type === "income"
                      ? "border-success bg-success/10 text-success"
                      : "border-coral bg-coral/10 text-coral"
                    : "border-border text-muted-foreground hover:bg-surface-raised",
                )}
              >
                {type === "income" ? "Entrada" : "Saída"}
              </button>
            ))}
          </div>

          <Field id="description" label="Descrição" error={errors.description}>
            <Input
              id="description"
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="Ex.: Plano Scale — Rede Farmacore"
              aria-invalid={Boolean(errors.description)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="amount" label="Valor (R$)" error={errors.amount}>
              <Input
                id="amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => set("amount", event.target.value)}
                placeholder="0,00"
                aria-invalid={Boolean(errors.amount)}
              />
            </Field>

            <Field id="date" label="Data" error={errors.date}>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(event) => set("date", event.target.value)}
                aria-invalid={Boolean(errors.date)}
              />
            </Field>
          </div>

          <Field id="categoryId" label="Categoria" error={errors.categoryId}>
            <Select value={form.categoryId} onValueChange={(value) => set("categoryId", value)}>
              <SelectTrigger id="categoryId" aria-invalid={Boolean(errors.categoryId)}>
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">
                    Nenhuma categoria de {form.type === "income" ? "entrada" : "saída"} cadastrada.
                  </div>
                ) : (
                  availableCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: category.color }} aria-hidden />
                        {category.name}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="accountId" label="Conta" error={errors.accountId}>
              <Select value={form.accountId} onValueChange={(value) => set("accountId", value)}>
                <SelectTrigger id="accountId" aria-invalid={Boolean(errors.accountId)}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field id="status" label="Status" error={errors.status}>
              <Select value={form.status} onValueChange={(value) => set("status", value)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="counterparty" label="Cliente / fornecedor" error={errors.counterparty} optional>
              <Input
                id="counterparty"
                value={form.counterparty}
                onChange={(event) => set("counterparty", event.target.value)}
                placeholder="Ex.: Cooperativa Serra Azul"
              />
            </Field>

            <Field id="method" label="Método" error={errors.method} optional>
              <Select
                value={form.method || "none"}
                onValueChange={(value) => set("method", value === "none" ? "" : value)}
              >
                <SelectTrigger id="method">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informado</SelectItem>
                  {METHOD_OPTIONS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field id="notes" label="Observações" error={errors.notes} optional>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(event) => set("notes", event.target.value)}
              placeholder="Contexto do lançamento, número da nota, centro de custo…"
              rows={3}
            />
          </Field>

          <div className="flex gap-2 border-t border-border pt-4">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar transação"}
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

function Field({
  id,
  label,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {optional ? <span className="text-[10px] uppercase tracking-wider text-subtle">opcional</span> : null}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
