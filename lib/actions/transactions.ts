"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guard";
import { transactionSchema, fieldErrorsFrom, type ActionResult } from "@/lib/validation";
import { transactionWhereFor } from "@/lib/actions/query-helpers";
import type { Transaction } from "@/types";

const AFFECTED_PATHS = ["/dashboard", "/transactions", "/cash-flow", "/reports"];

function revalidateAll() {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

/** Traduz falhas conhecidas do banco em mensagens que o usuário entende. */
function describeError(error: unknown): string {
  if (error instanceof Error && error.message === "NAO_AUTENTICADO") {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") return "Categoria ou conta inválida para este usuário.";
    if (error.code === "P2025") return "Registro não encontrado.";
  }
  console.error(error);
  return "Não foi possível concluir a operação. Tente novamente.";
}

/**
 * Confere que a categoria e a conta informadas pertencem ao usuário logado.
 * Sem isso um id de outro usuário passado pelo formulário seria aceito.
 */
async function assertOwnership(userId: string, categoryId: string, accountId: string) {
  const [category, account] = await Promise.all([
    prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true, type: true } }),
    prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } }),
  ]);
  if (!category) throw new Error("CATEGORIA_INVALIDA");
  if (!account) throw new Error("CONTA_INVALIDA");
  return category;
}

export async function createTransaction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = transactionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error) };
    }

    const data = parsed.data;
    const category = await assertOwnership(user.id, data.categoryId, data.accountId);
    if (category.type !== data.type) {
      return {
        ok: false,
        error: "A categoria escolhida não corresponde ao tipo do lançamento.",
        fieldErrors: { categoryId: "Selecione uma categoria de " + (data.type === "income" ? "entrada." : "saída.") },
      };
    }

    const created = await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: data.accountId,
        categoryId: data.categoryId,
        description: data.description,
        counterparty: data.counterparty || null,
        amount: new Prisma.Decimal(data.amount.toFixed(2)),
        type: data.type,
        status: data.status,
        method: data.method || null,
        notes: data.notes || null,
        date: new Date(`${data.date}T12:00:00.000Z`),
      },
      select: { id: true },
    });

    revalidateAll();
    return { ok: true, data: { id: created.id }, message: "Transação criada." };
  } catch (error) {
    if (error instanceof Error && error.message === "CATEGORIA_INVALIDA") {
      return { ok: false, error: "Categoria não encontrada.", fieldErrors: { categoryId: "Selecione uma categoria válida." } };
    }
    if (error instanceof Error && error.message === "CONTA_INVALIDA") {
      return { ok: false, error: "Conta não encontrada.", fieldErrors: { accountId: "Selecione uma conta válida." } };
    }
    return { ok: false, error: describeError(error) };
  }
}

export async function updateTransaction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = transactionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error) };
    }

    const data = parsed.data;
    const category = await assertOwnership(user.id, data.categoryId, data.accountId);
    if (category.type !== data.type) {
      return {
        ok: false,
        error: "A categoria escolhida não corresponde ao tipo do lançamento.",
        fieldErrors: { categoryId: "Selecione uma categoria de " + (data.type === "income" ? "entrada." : "saída.") },
      };
    }

    // updateMany com userId no filtro: um id de outro usuário simplesmente não casa.
    const result = await prisma.transaction.updateMany({
      where: { id, userId: user.id },
      data: {
        accountId: data.accountId,
        categoryId: data.categoryId,
        description: data.description,
        counterparty: data.counterparty || null,
        amount: new Prisma.Decimal(data.amount.toFixed(2)),
        type: data.type,
        status: data.status,
        method: data.method || null,
        notes: data.notes || null,
        date: new Date(`${data.date}T12:00:00.000Z`),
      },
    });

    if (result.count === 0) return { ok: false, error: "Transação não encontrada." };

    revalidateAll();
    return { ok: true, data: { id }, message: "Transação atualizada." };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function deleteTransaction(id: string): Promise<ActionResult<{ restore: Transaction | null }>> {
  try {
    const user = await requireUser();

    const existing = await prisma.transaction.findFirst({ where: { id, userId: user.id } });
    if (!existing) return { ok: false, error: "Transação não encontrada." };

    await prisma.transaction.deleteMany({ where: { id, userId: user.id } });
    revalidateAll();

    // Devolve o registro para permitir o "desfazer" do toast.
    return {
      ok: true,
      message: "Transação excluída.",
      data: {
        restore: {
          id: existing.id,
          date: existing.date.toISOString().slice(0, 10),
          description: existing.description,
          counterparty: existing.counterparty ?? "",
          categoryId: existing.categoryId,
          categoryLabel: "",
          categoryColor: null,
          accountId: existing.accountId,
          accountLabel: "",
          type: existing.type as Transaction["type"],
          amount: Number(existing.amount),
          status: existing.status as Transaction["status"],
          method: existing.method ?? "",
          notes: existing.notes,
          createdAt: existing.createdAt.toISOString(),
          updatedAt: existing.updatedAt.toISOString(),
        },
      },
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** Recria uma transação excluída, usada pelo "desfazer". */
export async function restoreTransaction(snapshot: Transaction): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    await assertOwnership(user.id, snapshot.categoryId, snapshot.accountId);

    const created = await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: snapshot.accountId,
        categoryId: snapshot.categoryId,
        description: snapshot.description,
        counterparty: snapshot.counterparty || null,
        amount: new Prisma.Decimal(snapshot.amount.toFixed(2)),
        type: snapshot.type,
        status: snapshot.status,
        method: snapshot.method || null,
        notes: snapshot.notes,
        date: new Date(`${snapshot.date}T12:00:00.000Z`),
      },
      select: { id: true },
    });

    revalidateAll();
    return { ok: true, data: { id: created.id }, message: "Transação restaurada." };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

// ------------------------------------------------------------ importação CSV

export interface ImportRow {
  description: string;
  amount: string;
  type: string;
  date: string;
  category: string;
  account: string;
  status?: string;
}

export interface ImportPreview {
  valid: (ImportRow & { categoryId: string; accountId: string; amountValue: number })[];
  invalid: { line: number; row: ImportRow; error: string }[];
}

/**
 * Valida as linhas do CSV contra as categorias e contas do usuário, resolvendo
 * os nomes para ids. Nada é gravado aqui — o usuário ainda vai confirmar.
 */
export async function previewImport(rows: ImportRow[]): Promise<ActionResult<ImportPreview>> {
  try {
    const user = await requireUser();
    const [categories, accounts] = await Promise.all([
      prisma.category.findMany({ where: { userId: user.id }, select: { id: true, name: true, type: true } }),
      prisma.account.findMany({ where: { userId: user.id, archived: false }, select: { id: true, name: true } }),
    ]);

    const normalize = (value: string) => value.trim().toLowerCase();
    const categoryByName = new Map(categories.map((c) => [normalize(c.name), c]));
    const accountByName = new Map(accounts.map((a) => [normalize(a.name), a]));

    const preview: ImportPreview = { valid: [], invalid: [] };

    rows.forEach((row, index) => {
      const line = index + 2; // +1 do cabeçalho, +1 porque planilha começa em 1
      const type = normalize(row.type ?? "");
      const normalizedType = ["entrada", "receita", "income"].includes(type)
        ? "income"
        : ["saida", "saída", "despesa", "expense"].includes(type)
          ? "expense"
          : null;

      if (!normalizedType) {
        preview.invalid.push({ line, row, error: `Tipo "${row.type}" não reconhecido (use entrada ou saída).` });
        return;
      }

      const parsed = transactionSchema.safeParse({
        description: row.description,
        amount: row.amount,
        type: normalizedType,
        status: row.status && ["pending", "completed", "canceled"].includes(row.status) ? row.status : "completed",
        categoryId: "placeholder",
        accountId: "placeholder",
        date: row.date,
      });

      if (!parsed.success) {
        preview.invalid.push({ line, row, error: Object.values(fieldErrorsFrom(parsed.error))[0] ?? "Linha inválida." });
        return;
      }

      const category = categoryByName.get(normalize(row.category ?? ""));
      if (!category) {
        preview.invalid.push({ line, row, error: `Categoria "${row.category}" não existe.` });
        return;
      }
      if (category.type !== normalizedType) {
        preview.invalid.push({ line, row, error: `"${category.name}" é uma categoria de ${category.type === "income" ? "entrada" : "saída"}.` });
        return;
      }

      const account = accountByName.get(normalize(row.account ?? ""));
      if (!account) {
        preview.invalid.push({ line, row, error: `Conta "${row.account}" não existe.` });
        return;
      }

      preview.valid.push({
        ...row,
        type: normalizedType,
        categoryId: category.id,
        accountId: account.id,
        amountValue: parsed.data.amount,
      });
    });

    return { ok: true, data: preview };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function confirmImport(rows: ImportPreview["valid"]): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requireUser();
    if (!rows.length) return { ok: false, error: "Nenhuma linha válida para importar." };

    // Reconferimos a posse: os ids vieram do cliente e não são confiáveis.
    const [categoryIds, accountIds] = await Promise.all([
      prisma.category.findMany({ where: { userId: user.id }, select: { id: true } }),
      prisma.account.findMany({ where: { userId: user.id }, select: { id: true } }),
    ]);
    const validCategories = new Set(categoryIds.map((c) => c.id));
    const validAccounts = new Set(accountIds.map((a) => a.id));

    const data = rows
      .filter((row) => validCategories.has(row.categoryId) && validAccounts.has(row.accountId))
      .map((row) => ({
        userId: user.id,
        accountId: row.accountId,
        categoryId: row.categoryId,
        description: row.description.trim(),
        amount: new Prisma.Decimal(row.amountValue.toFixed(2)),
        type: row.type,
        status: row.status && ["pending", "completed", "canceled"].includes(row.status) ? row.status : "completed",
        date: new Date(`${row.date}T12:00:00.000Z`),
        notes: "Importado via CSV",
      }));

    if (!data.length) return { ok: false, error: "Nenhuma linha pôde ser importada." };

    const result = await prisma.transaction.createMany({ data });
    revalidateAll();
    return { ok: true, data: { count: result.count }, message: `${result.count} transações importadas.` };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** Exporta o resultado do filtro atual (não só a página visível). */
export async function exportTransactionsCsv(query: {
  search?: string;
  categoryId?: string;
  status?: string;
  type?: string;
  period?: string;
  accountId?: string;
}): Promise<ActionResult<{ csv: string; count: number }>> {
  try {
    const user = await requireUser();
    const where = transactionWhereFor(user.id, query);

    const rows = await prisma.transaction.findMany({
      where,
      include: { category: { select: { name: true } }, account: { select: { name: true } } },
      orderBy: [{ date: "desc" }],
      take: 5000,
    });

    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ["Data", "Descrição", "Contraparte", "Categoria", "Conta", "Tipo", "Status", "Valor", "Método", "Observações"];
    const lines = rows.map((row) =>
      [
        row.date.toISOString().slice(0, 10),
        escape(row.description),
        escape(row.counterparty ?? ""),
        escape(row.category.name),
        escape(row.account.name),
        row.type === "income" ? "entrada" : "saída",
        row.status,
        Number(row.amount).toFixed(2).replace(".", ","),
        escape(row.method ?? ""),
        escape(row.notes ?? ""),
      ].join(";"),
    );

    return {
      ok: true,
      data: { csv: [header.join(";"), ...lines].join("\n"), count: rows.length },
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
