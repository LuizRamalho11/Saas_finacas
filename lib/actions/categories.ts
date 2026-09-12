"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineAction, defineQuery } from "@/lib/server/action";
import { AppError } from "@/lib/server/errors";
import { idSchema } from "@/lib/server/schemas";
import { categorySchema } from "@/lib/validation";
import { colorForIndex } from "@/lib/palette";
import type { CategoryRecord } from "@/types";

function revalidateCategories() {
  revalidatePath("/settings/categories");
  revalidatePath("/dashboard");
}

/** O índice único é por (userId, name): nome repetido é conflito, não falha interna. */
function duplicateNameError() {
  return new AppError("CONFLITO", {
    message: "Já existe uma categoria com esse nome.",
    fieldErrors: { name: "Nome já utilizado." },
  });
}

function isDuplicateName(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const listCategories = defineQuery({
  name: "listCategories",
  async handler({ user }): Promise<CategoryRecord[]> {
    const [categories, totals] = await Promise.all([
      prisma.category.findMany({ where: { userId: user.id }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
      prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { userId: user.id },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    const stats = new Map(totals.map((row) => [row.categoryId, row]));

    return categories.map((category, index) => ({
      id: category.id,
      name: category.name,
      type: category.type as CategoryRecord["type"],
      color: category.color ?? colorForIndex(index),
      icon: category.icon,
      transactionCount: stats.get(category.id)?._count._all ?? 0,
      total: Number(stats.get(category.id)?._sum.amount ?? 0),
    }));
  },
});

export const createCategory = defineAction({
  name: "createCategory",
  input: categorySchema,
  async handler({ input, user }) {
    try {
      const created = await prisma.category.create({
        data: {
          userId: user.id,
          name: input.name,
          type: input.type,
          color: input.color,
          icon: input.icon || null,
        },
        select: { id: true },
      });

      revalidateCategories();
      return { id: created.id };
    } catch (error) {
      throw isDuplicateName(error) ? duplicateNameError() : error;
    }
  },
  message: "Categoria criada.",
});

export const updateCategory = defineAction({
  name: "updateCategory",
  input: z.object({ id: idSchema, data: categorySchema }),
  async handler({ input: { id, data }, user }) {
    try {
      // Trocar o tipo de uma categoria já usada deixaria lançamentos incoerentes.
      const linked = await prisma.transaction.count({ where: { userId: user.id, categoryId: id } });
      const existing = await prisma.category.findFirst({ where: { id, userId: user.id } });
      if (!existing) throw new AppError("NAO_ENCONTRADO", { message: "Categoria não encontrada." });

      if (linked > 0 && existing.type !== data.type) {
        throw new AppError("CONFLITO", {
          message: `Esta categoria já tem ${linked} lançamento(s) e não pode mudar de tipo.`,
          fieldErrors: { type: "Tipo bloqueado por lançamentos existentes." },
        });
      }

      await prisma.category.updateMany({
        where: { id, userId: user.id },
        data: {
          name: data.name,
          type: data.type,
          color: data.color,
          icon: data.icon || null,
        },
      });

      revalidateCategories();
      return { id };
    } catch (error) {
      throw isDuplicateName(error) ? duplicateNameError() : error;
    }
  },
  message: "Categoria atualizada.",
});

/**
 * Exclui a categoria. Se houver lançamentos vinculados, exige que o usuário
 * escolha para onde realocá-los — nunca apagamos transações em cascata.
 */
export const deleteCategory = defineAction({
  name: "deleteCategory",
  input: z.object({ id: idSchema, reassignToId: idSchema.optional() }),
  async handler({ input: { id, reassignToId }, user }) {
    const category = await prisma.category.findFirst({ where: { id, userId: user.id } });
    if (!category) throw new AppError("NAO_ENCONTRADO", { message: "Categoria não encontrada." });

    const linked = await prisma.transaction.count({ where: { userId: user.id, categoryId: id } });

    if (linked > 0 && !reassignToId) {
      throw new AppError("CONFLITO", {
        message: `Esta categoria tem ${linked} lançamento(s). Escolha uma categoria de destino para realocá-los.`,
      });
    }

    let moved = 0;

    if (linked > 0 && reassignToId) {
      const target = await prisma.category.findFirst({
        where: { id: reassignToId, userId: user.id, type: category.type },
      });
      if (!target) {
        throw new AppError("SEM_PERMISSAO", {
          message: "A categoria de destino precisa ser do mesmo tipo e pertencer a você.",
        });
      }

      // Realocação e exclusão precisam acontecer juntas ou não acontecer.
      const [update] = await prisma.$transaction([
        prisma.transaction.updateMany({
          where: { userId: user.id, categoryId: id },
          data: { categoryId: reassignToId },
        }),
        prisma.category.deleteMany({ where: { id, userId: user.id } }),
      ]);
      moved = update.count;
    } else {
      await prisma.category.deleteMany({ where: { id, userId: user.id } });
    }

    revalidateCategories();
    return { moved };
  },
  message: ({ moved }) =>
    moved > 0 ? `Categoria excluída e ${moved} lançamento(s) realocados.` : "Categoria excluída.",
});
