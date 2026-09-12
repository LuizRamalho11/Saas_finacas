"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { createCategory, deleteCategory, listCategories, updateCategory } from "@/lib/actions/categories";
import { CATEGORY_COLORS } from "@/lib/palette";
import { formatCurrency } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import { cn } from "@/lib/utils";
import type { CategoryRecord } from "@/types";

export function CategoriesManager() {
  const router = useRouter();
  const { currency } = usePreferences();
  const [revision, setRevision] = React.useState(0);
  const refresh = () => {
    setRevision((value) => value + 1);
    router.refresh();
  };

  const { data, loading } = useAsync(() => listCategories(), [revision]);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CategoryRecord | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<CategoryRecord | null>(null);

  const categories = data ?? [];
  const income = categories.filter((c) => c.type === "income");
  const expense = categories.filter((c) => c.type === "expense");

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(category: CategoryRecord) {
    setEditing(category);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Categorias</CardTitle>
            <CardDescription>
              A cor definida aqui é a mesma usada nos gráficos do dashboard e dos relatórios.
            </CardDescription>
          </div>
          <Button onClick={openCreate}>
            <Plus aria-hidden /> Nova categoria
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="Nenhuma categoria cadastrada"
              description="Crie categorias de entrada e saída para classificar seus lançamentos e alimentar os gráficos."
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus aria-hidden /> Criar primeira categoria
                </Button>
              }
            />
          ) : (
            <>
              <Group
                title="Entradas"
                items={income}
                currency={currency}
                onEdit={openEdit}
                onDelete={setPendingDelete}
              />
              <Group title="Saídas" items={expense} currency={currency} onEdit={openEdit} onDelete={setPendingDelete} />
            </>
          )}
        </CardContent>
      </Card>

      <CategoryForm open={formOpen} onOpenChange={setFormOpen} category={editing} onSaved={refresh} />

      <DeleteCategoryDialog
        category={pendingDelete}
        categories={categories}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onDeleted={refresh}
      />
    </div>
  );
}

function Group({
  title,
  items,
  currency,
  onEdit,
  onDelete,
}: {
  title: string;
  items: CategoryRecord[];
  currency: ReturnType<typeof usePreferences>["currency"];
  onEdit: (category: CategoryRecord) => void;
  onDelete: (category: CategoryRecord) => void;
}) {
  if (!items.length) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-subtle">{title}</h3>
      <ul className="space-y-2">
        {items.map((category) => (
          <li
            key={category.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-raised/50 px-4 py-3"
          >
            <span className="size-3 shrink-0 rounded-full" style={{ background: category.color }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{category.name}</p>
              <p className="text-xs text-muted-foreground">
                {category.transactionCount} lançamento{category.transactionCount === 1 ? "" : "s"} ·{" "}
                {formatCurrency(category.total, currency, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <Badge variant={category.type === "income" ? "success" : "neutral"}>
              {category.type === "income" ? "Entrada" : "Saída"}
            </Badge>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(category)}
                aria-label={`Editar ${category.name}`}
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(category)}
                aria-label={`Excluir ${category.name}`}
                className="text-muted-foreground hover:text-danger"
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryForm({
  open,
  onOpenChange,
  category,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryRecord | null;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<"income" | "expense">("expense");
  const [color, setColor] = React.useState<string>(CATEGORY_COLORS[0].hex);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setName(category?.name ?? "");
    setType(category?.type ?? "expense");
    setColor(category?.color ?? CATEGORY_COLORS[0].hex);
  }, [open, category]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload = { name, type, color, icon: category?.icon ?? "" };
    const result = category ? await updateCategory({ id: category.id, data: payload }) : await createCategory(payload);
    setSaving(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? "Categoria salva.");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title={category ? "Editar categoria" : "Nova categoria"}
        description="Nome, tipo e cor usada nos gráficos."
      >
        <form onSubmit={handleSubmit} className="space-y-5 p-5" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="category-name">Nome</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Consultoria"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? (
              <p role="alert" className="text-xs text-danger">
                {errors.name}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="category-type">Tipo</Label>
            <Select value={type} onValueChange={(value) => setType(value as "income" | "expense")}>
              <SelectTrigger id="category-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Saída (despesa)</SelectItem>
                <SelectItem value="income">Entrada (receita)</SelectItem>
              </SelectContent>
            </Select>
            {errors.type ? (
              <p role="alert" className="text-xs text-danger">
                {errors.type}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Cor nos gráficos</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor da categoria">
              {CATEGORY_COLORS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={color === option.hex}
                  aria-label={option.label}
                  onClick={() => setColor(option.hex)}
                  className={cn(
                    "size-8 rounded-full border-2 transition-transform",
                    color === option.hex ? "scale-110 border-foreground" : "border-transparent hover:scale-105",
                  )}
                  style={{ background: option.hex }}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Todas as cores foram checadas para manter contraste no tema claro e no escuro.
            </p>
            {errors.color ? (
              <p role="alert" className="text-xs text-danger">
                {errors.color}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2 border-t border-border pt-4">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {saving ? "Salvando…" : category ? "Salvar alterações" : "Criar categoria"}
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

function DeleteCategoryDialog({
  category,
  categories,
  onOpenChange,
  onDeleted,
}: {
  category: CategoryRecord | null;
  categories: CategoryRecord[];
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [reassignTo, setReassignTo] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => setReassignTo(""), [category]);

  if (!category) return null;

  // Só faz sentido realocar para uma categoria do mesmo tipo.
  const targets = categories.filter((item) => item.id !== category.id && item.type === category.type);
  const needsReassign = category.transactionCount > 0;

  async function handleDelete() {
    if (!category) return;
    if (needsReassign && !reassignTo) {
      toast.error("Escolha uma categoria de destino para os lançamentos.");
      return;
    }

    setDeleting(true);
    const result = await deleteCategory({ id: category.id, reassignToId: reassignTo || undefined });
    setDeleting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? "Categoria excluída.");
    onOpenChange(false);
    onDeleted();
  }

  return (
    <AlertDialog open={Boolean(category)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Excluir “{category.name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          {needsReassign
            ? `Esta categoria tem ${category.transactionCount} lançamento(s). Escolha para onde movê-los — nenhuma transação será apagada.`
            : "Nenhum lançamento usa esta categoria. A exclusão é imediata."}
        </AlertDialogDescription>

        {needsReassign ? (
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="reassign">Mover lançamentos para</Label>
            {targets.length ? (
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger id="reassign">
                  <SelectValue placeholder="Selecione a categoria de destino" />
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
              <p className="text-xs text-danger">
                Não há outra categoria de {category.type === "income" ? "entrada" : "saída"} para receber os
                lançamentos. Crie uma antes de excluir esta.
              </p>
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
            {deleting ? "Excluindo…" : "Excluir categoria"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
