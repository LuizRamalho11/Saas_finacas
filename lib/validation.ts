import { z } from "zod";
import { isValidHex } from "@/lib/palette";

/** Aceita "1.234,56", "1234.56" e "R$ 1.234,56" — o usuário digita como quiser. */
export function parseAmount(input: unknown): number {
  if (typeof input === "number") return input;
  if (typeof input !== "string") return Number.NaN;

  const cleaned = input
    .replace(/[R$\s ]/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  return Number(cleaned);
}

export const transactionSchema = z.object({
  description: z
    .string()
    .trim()
    .min(3, "A descrição precisa ter ao menos 3 caracteres.")
    .max(140, "A descrição pode ter no máximo 140 caracteres."),
  counterparty: z.string().trim().max(120, "Nome muito longo.").optional().or(z.literal("")),
  amount: z
    .preprocess(parseAmount, z.number({ error: "Informe um valor numérico." }))
    .refine((value) => Number.isFinite(value) && value > 0, "O valor precisa ser maior que zero.")
    .refine((value) => value <= 999_999_999, "Valor acima do limite permitido."),
  type: z.enum(["income", "expense"], { error: "Selecione entrada ou saída." }),
  status: z.enum(["pending", "completed", "canceled"], { error: "Selecione um status válido." }),
  categoryId: z.string().min(1, "Selecione uma categoria."),
  accountId: z.string().min(1, "Selecione uma conta."),
  date: z
    .string()
    .min(1, "Informe a data.")
    .refine((value) => !Number.isNaN(Date.parse(value)), "Data inválida.")
    .refine(
      (value) => Date.parse(value) <= Date.now() + 365 * 86_400_000,
      "A data não pode estar mais de um ano no futuro.",
    ),
  method: z.string().trim().max(60).optional().or(z.literal("")),
  notes: z.string().trim().max(600, "As observações podem ter no máximo 600 caracteres.").optional().or(z.literal("")),
});

export type TransactionInput = z.input<typeof transactionSchema>;

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "O nome precisa ter ao menos 2 caracteres.")
    .max(60, "O nome pode ter no máximo 60 caracteres."),
  type: z.enum(["income", "expense"], { error: "Selecione o tipo da categoria." }),
  color: z.string().refine(isValidHex, "Escolha uma cor válida."),
  icon: z.string().trim().max(40).optional().or(z.literal("")),
});

export const accountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "O nome precisa ter ao menos 2 caracteres.")
    .max(60, "O nome pode ter no máximo 60 caracteres."),
  type: z.enum(["checking", "savings", "credit_card", "investment"], {
    error: "Selecione o tipo da conta.",
  }),
  institution: z.string().trim().max(80, "Nome muito longo.").optional().or(z.literal("")),
  openingBalance: z.preprocess(
    (value) => (value === "" || value === undefined || value === null ? 0 : parseAmount(value)),
    z.number({ error: "Informe um saldo numérico." }).refine(Number.isFinite, "Saldo inválido."),
  ),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(80),
  role: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.email({ error: "Informe um e-mail válido." }),
  timezone: z.string().trim().max(60).optional().or(z.literal("")),
  currency: z.enum(["BRL", "USD", "EUR"], { error: "Moeda não suportada." }),
});

/** Formato único de retorno das actions, consumido pelos formulários. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}
