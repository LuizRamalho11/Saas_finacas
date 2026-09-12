"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guard";
import { categorySchema, fieldErrorsFrom, type ActionResult } from "@/lib/validation";
import { colorForIndex } from "@/lib/palette";
import type { CategoryRecord } from "@/types";

function describeError(error: unknown): string {
  if (error instanceof Error && error.message === "NAO_AUTENTICADO") {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  console.error(error);
  return "Não foi possível concluir a operação. Tente novamente.";
}

export async function listCategories(): Promise<CategoryRecord[]> {
  const user = await requireUser();

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
}

export async function createCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error) };
    }

    const created = await prisma.category.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        type: parsed.data.type,
        color: parsed.data.color,
        icon: parsed.data.icon || null,
      },
      select: { id: true },
    });

    revalidatePath("/settings/categories");
    revalidatePath("/dashboard");
    return { ok: true, data: { id: created.id }, message: "Categoria criada." };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Já existe uma categoria com esse nome.", fieldErrors: { name: "Nome já utilizado." } };
    }
    return { ok: false, error: describeError(error) };
  }
}

export async function updateCategory(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error) };
    }

    // Trocar o tipo de uma categoria já usada deixaria lançamentos incoerentes.
    const linked = await prisma.transaction.count({ where: { userId: user.id, categoryId: id } });
    const existing = await prisma.category.findFirst({ where: { id, userId: user.id } });
    if (!existing) return { ok: false, error: "Categoria não encontrada." };

    if (linked > 0 && existing.type !== parsed.data.type) {
      return {
        ok: false,
        error: `Esta categoria já tem ${linked} lançamento(s) e não pode mudar de tipo.`,
        fieldErrors: { type: "Tipo bloqueado por lançamentos existentes." },
      };
    }

    await prisma.category.updateMany({
      where: { id, userId: user.id },
      data: {
        name: parsed.data.name,
        type: parsed.data.type,
        color: parsed.data.color,
        icon: parsed.data.icon || null,
      },
    });

    revalidatePath("/settings/categories");
    revalidatePath("/dashboard");
    return { ok: true, data: { id }, message: "Categoria atualizada." };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Já existe uma categoria com esse nome.", fieldErrors: { name: "Nome já utilizado." } };
    }
    return { ok: false, error: describeError(error) };
  }
}

/**
 * Exclui a categoria. Se houver lançamentos vinculados, exige que o usuário
 * escolha para onde realocá-los — nunca apagamos transações em cascata.
 */
export async function deleteCategory(
  id: string,
  reassignToId?: string,
): Promise<ActionResult<{ moved: number }>> {
  try {
    const user = await requireUser();

    const category = await prisma.category.findFirst({ where: { id, userId: user.id } });
    if (!category) return { ok: false, error: "Categoria não encontrada." };

    const linked = await prisma.transaction.count({ where: { userId: user.id, categoryId: id } });

    if (linked > 0 && !reassignToId) {
      return {
        ok: false,
        error: `Esta categoria tem ${linked} lançamento(s). Escolha uma categoria de destino para realocá-los.`,
      };
    }

    let moved = 0;

    if (linked > 0 && reassignToId) {
      const target = await prisma.category.findFirst({
        where: { id: reassignToId, userId: user.id, type: category.type },
      });
      if (!target) {
        return { ok: false, error: "A categoria de destino precisa ser do mesmo tipo e pertencer a você." };
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

    revalidatePath("/settings/categories");
    revalidatePath("/dashboard");
    return {
      ok: true,
      data: { moved },
      message: moved > 0 ? `Categoria excluída e ${moved} lançamento(s) realocados.` : "Categoria excluída.",
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
