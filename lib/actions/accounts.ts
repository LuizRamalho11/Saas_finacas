"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineAction, defineQuery } from "@/lib/server/action";
import { AppError } from "@/lib/server/errors";
import { idSchema } from "@/lib/server/schemas";
import { accountSchema } from "@/lib/validation";
import type { AccountRecord } from "@/types";

function revalidateAccounts() {
  revalidatePath("/settings/accounts");
  revalidatePath("/cash-flow");
}

/** O índice único é por (userId, name): nome repetido é conflito, não falha interna. */
function duplicateNameError() {
  return new AppError("CONFLITO", {
    message: "Já existe uma conta com esse nome.",
    fieldErrors: { name: "Nome já utilizado." },
  });
}

function isDuplicateName(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const listAccounts = defineQuery({
  name: "listAccounts",
  async handler({ user }): Promise<AccountRecord[]> {
    const [accounts, grouped] = await Promise.all([
      prisma.account.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
      prisma.transaction.groupBy({
        by: ["accountId", "type"],
        where: { userId: user.id, status: { not: "canceled" } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const movement = new Map<string, { balance: number; count: number }>();
    for (const row of grouped) {
      const entry = movement.get(row.accountId) ?? { balance: 0, count: 0 };
      entry.balance += row.type === "income" ? Number(row._sum.amount ?? 0) : -Number(row._sum.amount ?? 0);
      entry.count += row._count._all;
      movement.set(row.accountId, entry);
    }

    return accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      institution: account.institution ?? "",
      openingBalance: Number(account.openingBalance),
      balance: Number(account.openingBalance) + (movement.get(account.id)?.balance ?? 0),
      transactionCount: movement.get(account.id)?.count ?? 0,
      archived: account.archived,
    }));
  },
});

export const createAccount = defineAction({
  name: "createAccount",
  input: accountSchema,
  message: "Conta criada.",
  async handler({ input, user }) {
    try {
      const created = await prisma.account.create({
        data: {
          userId: user.id,
          name: input.name,
          type: input.type,
          institution: input.institution || null,
          openingBalance: new Prisma.Decimal(input.openingBalance.toFixed(2)),
        },
        select: { id: true },
      });

      revalidateAccounts();
      return { id: created.id };
    } catch (error) {
      throw isDuplicateName(error) ? duplicateNameError() : error;
    }
  },
});

export const updateAccount = defineAction({
  name: "updateAccount",
  input: z.object({ id: idSchema, data: accountSchema }),
  message: "Conta atualizada.",
  async handler({ input: { id, data }, user }) {
    try {
      // updateMany com userId no filtro: um id de outro usuário não casa.
      const result = await prisma.account.updateMany({
        where: { id, userId: user.id },
        data: {
          name: data.name,
          type: data.type,
          institution: data.institution || null,
          openingBalance: new Prisma.Decimal(data.openingBalance.toFixed(2)),
        },
      });

      if (result.count === 0) {
        throw new AppError("NAO_ENCONTRADO", { message: "Conta não encontrada." });
      }

      revalidateAccounts();
      return { id };
    } catch (error) {
      throw isDuplicateName(error) ? duplicateNameError() : error;
    }
  },
});

/**
 * Exclui a conta. Com lançamentos vinculados, exige realocação — apagar em
 * cascata destruiria o histórico financeiro do usuário.
 */
export const deleteAccount = defineAction({
  name: "deleteAccount",
  input: z.object({ id: idSchema, reassignToId: idSchema.optional() }),
  async handler({ input: { id, reassignToId }, user }) {
    const account = await prisma.account.findFirst({ where: { id, userId: user.id } });
    if (!account) throw new AppError("NAO_ENCONTRADO", { message: "Conta não encontrada." });

    const remaining = await prisma.account.count({ where: { userId: user.id } });
    if (remaining <= 1) {
      throw new AppError("CONFLITO", { message: "Você precisa manter ao menos uma conta ativa." });
    }

    const linked = await prisma.transaction.count({ where: { userId: user.id, accountId: id } });

    if (linked > 0 && !reassignToId) {
      throw new AppError("CONFLITO", {
        message: `Esta conta tem ${linked} lançamento(s). Escolha uma conta de destino para realocá-los.`,
      });
    }

    let moved = 0;

    if (linked > 0 && reassignToId) {
      const target = await prisma.account.findFirst({ where: { id: reassignToId, userId: user.id } });
      if (!target) {
        throw new AppError("SEM_PERMISSAO", { message: "A conta de destino precisa pertencer a você." });
      }

      const [update] = await prisma.$transaction([
        prisma.transaction.updateMany({
          where: { userId: user.id, accountId: id },
          data: { accountId: reassignToId },
        }),
        prisma.account.deleteMany({ where: { id, userId: user.id } }),
      ]);
      moved = update.count;
    } else {
      await prisma.account.deleteMany({ where: { id, userId: user.id } });
    }

    revalidateAccounts();
    return { moved };
  },
  message: ({ moved }) => (moved > 0 ? `Conta excluída e ${moved} lançamento(s) realocados.` : "Conta excluída."),
});
