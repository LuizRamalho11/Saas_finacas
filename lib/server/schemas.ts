import { z } from "zod";

/**
 * Parâmetros de leitura com limite. Toda Server Action é um endpoint público:
 * sem teto, `pageSize` ou `months` viram extração em massa e DoS (F05).
 */
export const idSchema = z.string().trim().min(1, "Identificador inválido.").max(40, "Identificador inválido.");

/** Id opcional que também aceita o valor "all" usado pelos filtros da interface. */
export const idOrAllSchema = z.union([z.literal("all"), idSchema]);

export const periodSchema = z.enum(["30d", "90d", "365d"], { error: "Período inválido." });

export const pageSchema = z.number().int().min(1, "Página inválida.").max(10_000, "Página inválida.");

export const pageSizeSchema = z
  .number()
  .int()
  .min(1, "Quantidade por página inválida.")
  .max(100, "No máximo 100 registros por página.");

export const monthsSchema = z.number().int().min(1, "Informe de 1 a 36 meses.").max(36, "Informe de 1 a 36 meses.");

export const limitSchema = z.number().int().min(1, "Limite inválido.").max(50, "No máximo 50 registros.");

export const searchSchema = z.string().trim().max(120, "Busca muito longa.");

export const transactionTypeFilterSchema = z.enum(["all", "income", "expense"], { error: "Tipo inválido." });

export const transactionStatusFilterSchema = z.enum(["all", "pending", "completed", "canceled"], {
  error: "Status inválido.",
});

/** Filtros compartilhados pela listagem e pela exportação de lançamentos. */
export const transactionFilterSchema = z.object({
  search: searchSchema.optional(),
  categoryId: idOrAllSchema.optional(),
  accountId: idOrAllSchema.optional(),
  status: transactionStatusFilterSchema.optional(),
  type: transactionTypeFilterSchema.optional(),
  period: periodSchema.optional(),
});

export const transactionQuerySchema = transactionFilterSchema.extend({
  page: pageSchema.optional(),
  pageSize: pageSizeSchema.optional(),
});
