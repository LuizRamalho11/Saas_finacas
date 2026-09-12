import type { Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { PERIOD_DAYS, addDays, startOfUtcDay } from "@/lib/periods";
import type { Period } from "@/types";

export interface TransactionFilters {
  search?: string;
  categoryId?: string;
  /** "all" é a opção da interface; o resto vem do enum do banco. */
  status?: TransactionStatus | "all";
  type?: TransactionType | "all";
  period?: string;
  accountId?: string;
}

/**
 * Monta o filtro da listagem de transações.
 * O `userId` é sempre o primeiro parâmetro e vem da sessão — nunca do cliente.
 */
export function transactionWhereFor(userId: string, filters: TransactionFilters): Prisma.TransactionWhereInput {
  const { search = "", categoryId = "all", status = "all", type = "all", period = "90d", accountId = "all" } = filters;

  const days = PERIOD_DAYS[period as Period] ?? PERIOD_DAYS["90d"];
  const from = addDays(startOfUtcDay(), -days);
  const term = search.trim();

  return {
    userId,
    date: { gte: from },
    ...(categoryId !== "all" ? { categoryId } : {}),
    ...(status !== "all" ? { status } : {}),
    ...(type !== "all" ? { type } : {}),
    ...(accountId !== "all" ? { accountId } : {}),
    ...(term
      ? {
          OR: [
            { description: { contains: term, mode: "insensitive" as const } },
            { counterparty: { contains: term, mode: "insensitive" as const } },
            { notes: { contains: term, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}
