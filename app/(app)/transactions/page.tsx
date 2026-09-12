"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Download, Plus, RotateCcw, Search, Upload } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { TransactionDetail } from "@/components/transactions/transaction-detail";
import { DeleteTransactionDialog } from "@/components/transactions/delete-transaction-dialog";
import { SectionHeading } from "@/components/common/section-heading";
import { usePeriod } from "@/components/layout/period-context";
import { usePreferences } from "@/components/providers";
import { useAsync } from "@/lib/use-async";
import { PERIOD_LABEL } from "@/lib/periods";
import { getTransactions } from "@/lib/api";
import { exportTransactionsCsv } from "@/lib/actions/transactions";
import { listCategories } from "@/lib/actions/categories";
import { listAccounts } from "@/lib/actions/accounts";
import { formatCurrency } from "@/lib/format";
import type { Transaction, TransactionStatus } from "@/types";

const STATUS_OPTIONS = [
  { value: "completed", label: "Concluída" },
  { value: "pending", label: "Pendente" },
  { value: "canceled", label: "Cancelada" },
];

const PAGE_SIZE = 8;

export default function TransactionsPage() {
  const { period, accountId } = usePeriod();
  const { currency } = usePreferences();

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("all");
  const [status, setStatus] = React.useState<TransactionStatus | "all">("all");
  const [type, setType] = React.useState<"all" | "income" | "expense">("all");
  const [page, setPage] = React.useState(1);
  const [exporting, setExporting] = React.useState(false);

  /** Muda a cada mutação para forçar o recarregamento da lista. */
  const [revision, setRevision] = React.useState(0);
  const refresh = React.useCallback(() => setRevision((value) => value + 1), []);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Transaction | null>(null);
  const [detail, setDetail] = React.useState<Transaction | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<Transaction | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryId, status, type, period, accountId]);

  const categories = useAsync(() => listCategories(), [revision]);
  const accounts = useAsync(() => listAccounts(), [revision]);

  const result = useAsync(
    () =>
      getTransactions({
        search: debouncedSearch,
        categoryId,
        status,
        type,
        period,
        accountId,
        page,
        pageSize: PAGE_SIZE,
      }),
    [debouncedSearch, categoryId, status, type, period, accountId, page, revision],
  );

  const filtersActive = Boolean(debouncedSearch) || categoryId !== "all" || status !== "all" || type !== "all";

  function resetFilters() {
    setSearch("");
    setCategoryId("all");
    setStatus("all");
    setType("all");
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(transaction: Transaction) {
    setDetailOpen(false);
    setEditing(transaction);
    setFormOpen(true);
  }

  function openDelete(transaction: Transaction) {
    setDetailOpen(false);
    setPendingDelete(transaction);
    setDeleteOpen(true);
  }

  function openDetail(transaction: Transaction) {
    setDetail(transaction);
    setDetailOpen(true);
  }

  async function handleExport() {
    setExporting(true);
    const response = await exportTransactionsCsv({
      search: debouncedSearch,
      categoryId,
      status,
      type,
      period,
      accountId,
    });
    setExporting(false);

    if (!response.ok) {
      toast.error(response.error);
      return;
    }

    // BOM para o Excel abrir os acentos corretamente
    const blob = new Blob([`﻿${response.data.csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `finora-transacoes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success(`${response.data.count} transações exportadas.`);
  }

  const data = result.data;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Extrato consolidado"
        description={`${PERIOD_LABEL[period]} · busca, filtros, importação e exportação`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <Link href="/transactions/import">
                <Upload aria-hidden /> Importar CSV
              </Link>
            </Button>
            <Button variant="secondary" onClick={handleExport} disabled={exporting || !data?.total}>
              <Download aria-hidden />
              {exporting ? "Gerando…" : "Exportar CSV"}
            </Button>
            <Button onClick={openCreate}>
              <Plus aria-hidden /> Nova transação
            </Button>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Lançamentos filtrados", value: data ? String(data.total) : null, tone: "text-foreground" },
          {
            label: "Entradas",
            value: data ? formatCurrency(data.totalIncome, currency, { maximumFractionDigits: 0 }) : null,
            tone: "text-success",
          },
          {
            label: "Saídas",
            value: data ? formatCurrency(data.totalExpense, currency, { maximumFractionDigits: 0 }) : null,
            tone: "text-coral",
          },
        ].map((item) => (
          <Card key={item.label} className="p-5">
            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
            {result.loading || item.value === null ? (
              <Skeleton className="mt-2 h-7 w-28" />
            ) : (
              <p className={`tabular mt-1.5 text-kpi font-semibold ${item.tone}`}>{item.value}</p>
            )}
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="flex-col items-stretch gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>Todos os lançamentos</CardTitle>
              <CardDescription>
                {data ? `${data.total} resultado${data.total === 1 ? "" : "s"}` : "Carregando resultados…"}
              </CardDescription>
            </div>
            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <RotateCcw aria-hidden /> Limpar filtros
              </Button>
            ) : null}
          </div>

          <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="relative">
              <span className="sr-only">Buscar por descrição, cliente ou observação</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar descrição, cliente…"
                className="pl-9"
              />
            </label>

            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger aria-label="Filtrar por categoria">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {(categories.data ?? []).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: category.color }} aria-hidden />
                      {category.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={(value) => setStatus(value as TransactionStatus | "all")}>
              <SelectTrigger aria-label="Filtrar por status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={type} onValueChange={(value) => setType(value as "all" | "income" | "expense")}>
              <SelectTrigger aria-label="Filtrar por tipo">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Entradas e saídas</SelectItem>
                <SelectItem value="income">Somente entradas</SelectItem>
                <SelectItem value="expense">Somente saídas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="px-0">
          <TransactionsTable
            rows={data?.rows ?? []}
            loading={result.loading}
            skeletonRows={PAGE_SIZE}
            onRowClick={openDetail}
            onEdit={openEdit}
            onDelete={openDelete}
            emptyTitle={filtersActive ? "Nenhum lançamento encontrado" : "Nenhum lançamento neste período"}
            emptyDescription={
              filtersActive
                ? "Ajuste os filtros ou amplie o período para ver movimentações."
                : "Crie o primeiro lançamento para começar a acompanhar receitas e despesas."
            }
            emptyAction={
              filtersActive ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Limpar filtros
                </Button>
              ) : (
                <Button size="sm" onClick={openCreate}>
                  <Plus aria-hidden /> Nova transação
                </Button>
              )
            }
          />
        </CardContent>

        {data && data.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p className="text-xs text-muted-foreground">
              Página {data.page} de {data.pageCount} · {PAGE_SIZE} por página
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={data.page <= 1}
              >
                <ChevronLeft aria-hidden /> Anterior
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.min(data.pageCount, current + 1))}
                disabled={data.page >= data.pageCount}
              >
                Próxima <ChevronRight aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories.data ?? []}
        accounts={accounts.data ?? []}
        transaction={editing}
        onSaved={refresh}
      />

      <TransactionDetail
        transaction={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={openEdit}
        onDelete={openDelete}
      />

      <DeleteTransactionDialog
        transaction={pendingDelete}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={refresh}
      />
    </div>
  );
}
