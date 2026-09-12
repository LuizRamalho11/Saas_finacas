import { describe, expect, it } from "vitest";
import { accountSchema, categorySchema, transactionSchema } from "@/lib/validation";

const validTransaction = {
  description: "Assinatura de software",
  amount: "199,90",
  type: "expense",
  status: "completed",
  categoryId: "cat_1",
  accountId: "acc_1",
  date: "2026-06-15",
};

describe("transactionSchema", () => {
  it("aceita um lançamento bem formado", () => {
    const parsed = transactionSchema.safeParse(validTransaction);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.amount).toBe(199.9);
  });

  it("recusa valor zerado ou negativo", () => {
    expect(transactionSchema.safeParse({ ...validTransaction, amount: "0" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...validTransaction, amount: "-10" }).success).toBe(false);
  });

  it("recusa valor acima do limite", () => {
    expect(transactionSchema.safeParse({ ...validTransaction, amount: "1000000000" }).success).toBe(false);
  });

  it("recusa data mais de um ano no futuro", () => {
    const farFuture = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
    expect(transactionSchema.safeParse({ ...validTransaction, date: farFuture }).success).toBe(false);
  });

  it("recusa tipo e status fora da lista", () => {
    expect(transactionSchema.safeParse({ ...validTransaction, type: "transfer" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...validTransaction, status: "aprovado" }).success).toBe(false);
  });

  it("recusa descrição curta demais ou longa demais", () => {
    expect(transactionSchema.safeParse({ ...validTransaction, description: "ab" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...validTransaction, description: "a".repeat(141) }).success).toBe(false);
  });
});

describe("categorySchema", () => {
  it("exige cor hexadecimal válida", () => {
    const base = { name: "Marketing", type: "expense" };
    expect(categorySchema.safeParse({ ...base, color: "#2563eb" }).success).toBe(true);
    expect(categorySchema.safeParse({ ...base, color: "azul" }).success).toBe(false);
  });
});

describe("accountSchema", () => {
  it("aceita saldo em formato brasileiro e recusa tipo desconhecido", () => {
    const parsed = accountSchema.safeParse({ name: "Conta corrente", type: "checking", openingBalance: "1.500,00" });
    expect(parsed.success && parsed.data.openingBalance).toBe(1500);
    expect(accountSchema.safeParse({ name: "Cofre", type: "cofre", openingBalance: "0" }).success).toBe(false);
  });
});
