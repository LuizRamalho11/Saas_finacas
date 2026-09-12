"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guard";
import { accountSchema, fieldErrorsFrom, type ActionResult } from "@/lib/validation";
import type { AccountRecord } from "@/types";

function describeError(error: unknown): string {
  if (error instanceof Error && error.message === "NAO_AUTENTICADO") {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  console.error(error);
  return "Não foi possível concluir a operação. Tente novamente.";
}

export async function listAccounts(): Promise<AccountRecord[]> {
  const user = await requireUser();

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
}

export async function createAccount(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = accountSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error) };
    }

    const created = await prisma.account.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        type: parsed.data.type,
        institution: parsed.data.institution || null,
        openingBalance: new Prisma.Decimal(parsed.data.openingBalance.toFixed(2)),
      },
      select: { id: true },
    });

    revalidatePath("/settings/accounts");
    revalidatePath("/cash-flow");
    return { ok: true, data: { id: created.id }, message: "Conta criada." };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Já existe uma conta com esse nome.", fieldErrors: { name: "Nome já utilizado." } };
    }
    return { ok: false, error: describeError(error) };
  }
}

export async function updateAccount(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = accountSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error) };
    }

    const result = await prisma.account.updateMany({
      where: { id, userId: user.id },
      data: {
        name: parsed.data.name,
        type: parsed.data.type,
        institution: parsed.data.institution || null,
        openingBalance: new Prisma.Decimal(parsed.data.openingBalance.toFixed(2)),
      },
    });

    if (result.count === 0) return { ok: false, error: "Conta não encontrada." };

    revalidatePath("/settings/accounts");
    revalidatePath("/cash-flow");
    return { ok: true, data: { id }, message: "Conta atualizada." };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Já existe uma conta com esse nome.", fieldErrors: { name: "Nome já utilizado." } };
    }
    return { ok: false, error: describeError(error) };
  }
}

/**
 * Exclui a conta. Com lançamentos vinculados, exige realocação — apagar em
 * cascata destruiria o histórico financeiro do usuário.
 */
export async function deleteAccount(
  id: string,
  reassignToId?: string,
): Promise<ActionResult<{ moved: number }>> {
  try {
    const user = await requireUser();

    const account = await prisma.account.findFirst({ where: { id, userId: user.id } });
    if (!account) return { ok: false, error: "Conta não encontrada." };

    const remaining = await prisma.account.count({ where: { userId: user.id } });
    if (remaining <= 1) {
      return { ok: false, error: "Você precisa manter ao menos uma conta ativa." };
    }

    const linked = await prisma.transaction.count({ where: { userId: user.id, accountId: id } });

    if (linked > 0 && !reassignToId) {
      return {
        ok: false,
        error: `Esta conta tem ${linked} lançamento(s). Escolha uma conta de destino para realocá-los.`,
      };
    }

    let moved = 0;

    if (linked > 0 && reassignToId) {
      const target = await prisma.account.findFirst({ where: { id: reassignToId, userId: user.id } });
      if (!target) return { ok: false, error: "A conta de destino precisa pertencer a você." };

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

    revalidatePath("/settings/accounts");
    revalidatePath("/cash-flow");
    return {
      ok: true,
      data: { moved },
      message: moved > 0 ? `Conta excluída e ${moved} lançamento(s) realocados.` : "Conta excluída.",
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
