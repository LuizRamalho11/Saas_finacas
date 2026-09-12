"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineAction } from "@/lib/server/action";
import { AppError } from "@/lib/server/errors";
import { idSchema, transactionFilterSchema } from "@/lib/server/schemas";
import { fieldErrorsFrom, transactionSchema } from "@/lib/validation";
import { transactionWhereFor } from "@/lib/actions/query-helpers";
import type { Transaction } from "@/types";

const AFFECTED_PATHS = ["/dashboard", "/transactions", "/cash-flow", "/reports"];

function revalidateAll() {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

/**
 * Confere que a categoria e a conta informadas pertencem ao usuário logado.
 * Sem isso um id de outro usuário passado pelo formulário seria aceito.
 */
async function assertOwnership(userId: string, categoryId: string, accountId: string) {
  const [category, account] = await Promise.all([
    prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true, name: true, type: true } }),
    prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } }),
  ]);
  if (!category) {
    throw new AppError("NAO_ENCONTRADO", {
      message: "Categoria não encontrada.",
      fieldErrors: { categoryId: "Selecione uma categoria válida." },
    });
  }
  if (!account) {
    throw new AppError("NAO_ENCONTRADO", {
      message: "Conta não encontrada.",
      fieldErrors: { accountId: "Selecione uma conta válida." },
    });
  }
  return category;
}

/** O tipo do lançamento tem de bater com o tipo da categoria escolhida. */
function assertTypeMatches(categoryType: string, type: "income" | "expense") {
  if (categoryType === type) return;
  throw new AppError("DADOS_INVALIDOS", {
    message: "A categoria escolhida não corresponde ao tipo do lançamento.",
    fieldErrors: {
      categoryId: `Selecione uma categoria de ${type === "income" ? "entrada" : "saída"}.`,
    },
  });
}

function transactionData(userId: string, input: z.infer<typeof transactionSchema>) {
  return {
    userId,
    accountId: input.accountId,
    categoryId: input.categoryId,
    description: input.description,
    counterparty: input.counterparty || null,
    amount: new Prisma.Decimal(input.amount.toFixed(2)),
    type: input.type,
    status: input.status,
    method: input.method || null,
    notes: input.notes || null,
    date: new Date(`${input.date}T12:00:00.000Z`),
  };
}

export const createTransaction = defineAction({
  name: "createTransaction",
  input: transactionSchema,
  async handler({ input, user }) {
    const category = await assertOwnership(user.id, input.categoryId, input.accountId);
    assertTypeMatches(category.type, input.type);

    const created = await prisma.transaction.create({
      data: transactionData(user.id, input),
      select: { id: true },
    });

    revalidateAll();
    return { id: created.id };
  },
  message: "Transação criada.",
});

export const updateTransaction = defineAction({
  name: "updateTransaction",
  input: z.object({ id: idSchema, data: transactionSchema }),
  async handler({ input: { id, data }, user }) {
    const category = await assertOwnership(user.id, data.categoryId, data.accountId);
    assertTypeMatches(category.type, data.type);

    // updateMany com userId no filtro: um id de outro usuário simplesmente não casa.
    const { userId: _userId, ...fields } = transactionData(user.id, data);
    const result = await prisma.transaction.updateMany({ where: { id, userId: user.id }, data: fields });

    if (result.count === 0) {
      throw new AppError("NAO_ENCONTRADO", { message: "Transação não encontrada." });
    }

    revalidateAll();
    return { id };
  },
  message: "Transação atualizada.",
});

export const deleteTransaction = defineAction({
  name: "deleteTransaction",
  input: idSchema,
  async handler({ input: id, user }): Promise<{ restore: Transaction | null }> {
    const existing = await prisma.transaction.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new AppError("NAO_ENCONTRADO", { message: "Transação não encontrada." });

    await prisma.transaction.deleteMany({ where: { id, userId: user.id } });
    revalidateAll();

    // Devolve o registro para permitir o "desfazer" do toast.
    return {
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
    };
  },
  message: "Transação excluída.",
});

/**
 * Recria uma transação excluída, usada pelo "desfazer".
 *
 * O snapshot vem do cliente, então nada dele é confiável: passa pelo mesmo
 * schema de um lançamento novo e pela mesma checagem de posse.
 */
const restoreSchema = transactionSchema.extend({
  notes: z.string().trim().max(600, "As observações podem ter no máximo 600 caracteres.").nullish(),
});

export const restoreTransaction = defineAction({
  name: "restoreTransaction",
  input: restoreSchema,
  async handler({ input, user }) {
    const category = await assertOwnership(user.id, input.categoryId, input.accountId);
    assertTypeMatches(category.type, input.type);

    const created = await prisma.transaction.create({
      data: transactionData(user.id, { ...input, notes: input.notes ?? undefined }),
      select: { id: true },
    });

    revalidateAll();
    return { id: created.id };
  },
  message: "Transação restaurada.",
});

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

/** Teto do arquivo importado: acima disso vira extração em massa e trabalho de DoS. */
const MAX_IMPORT_ROWS = 5_000;

const importRowSchema = z.object({
  description: z.string().max(300, "Descrição muito longa."),
  amount: z.string().max(40, "Valor muito longo."),
  type: z.string().max(40, "Tipo muito longo."),
  date: z.string().max(40, "Data muito longa."),
  category: z.string().max(120, "Categoria muito longa."),
  account: z.string().max(120, "Conta muito longa."),
  status: z.string().max(40, "Status muito longo.").optional(),
});

const importRowsSchema = z
  .array(importRowSchema)
  .min(1, "Nenhuma linha para importar.")
  .max(MAX_IMPORT_ROWS, `A importação aceita no máximo ${MAX_IMPORT_ROWS} linhas por arquivo.`);

const previewRowsSchema = z
  .array(importRowSchema.extend({ categoryId: idSchema, accountId: idSchema, amountValue: z.number() }))
  .min(1, "Nenhuma linha válida para importar.")
  .max(MAX_IMPORT_ROWS, `A importação aceita no máximo ${MAX_IMPORT_ROWS} linhas por arquivo.`);

/**
 * Valida as linhas do CSV contra as categorias e contas do usuário, resolvendo
 * os nomes para ids. Nada é gravado aqui — o usuário ainda vai confirmar.
 */
export const previewImport = defineAction({
  name: "previewImport",
  input: importRowsSchema,
  async handler({ input: rows, user }): Promise<ImportPreview> {
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
        preview.invalid.push({
          line,
          row,
          error: Object.values(fieldErrorsFrom(parsed.error))[0] ?? "Linha inválida.",
        });
        return;
      }

      const category = categoryByName.get(normalize(row.category ?? ""));
      if (!category) {
        preview.invalid.push({ line, row, error: `Categoria "${row.category}" não existe.` });
        return;
      }
      if (category.type !== normalizedType) {
        preview.invalid.push({
          line,
          row,
          error: `"${category.name}" é uma categoria de ${category.type === "income" ? "entrada" : "saída"}.`,
        });
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

    return preview;
  },
});

export const confirmImport = defineAction({
  name: "confirmImport",
  input: previewRowsSchema,
  async handler({ input: rows, user }) {
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

    if (!data.length) {
      throw new AppError("DADOS_INVALIDOS", { message: "Nenhuma linha pôde ser importada." });
    }

    const result = await prisma.transaction.createMany({ data });
    revalidateAll();
    return { count: result.count };
  },
  message: ({ count }) => `${count} transações importadas.`,
});

/**
 * Exporta o resultado do filtro atual (não só a página visível).
 *
 * É leitura, mas usa `defineAction` porque a tela trata a falha como toast de
 * erro, e não como tela quebrada.
 */
export const exportTransactionsCsv = defineAction({
  name: "exportTransactionsCsv",
  input: transactionFilterSchema,
  async handler({ input: query, user }) {
    const where = transactionWhereFor(user.id, query);

    const rows = await prisma.transaction.findMany({
      where,
      include: { category: { select: { name: true } }, account: { select: { name: true } } },
      orderBy: [{ date: "desc" }],
      take: 5000,
    });

    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = [
      "Data",
      "Descrição",
      "Contraparte",
      "Categoria",
      "Conta",
      "Tipo",
      "Status",
      "Valor",
      "Método",
      "Observações",
    ];
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

    return { csv: [header.join(";"), ...lines].join("\n"), count: rows.length };
  },
});
