import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getTransaction } from "@/lib/api";
import { createTransaction, deleteTransaction, updateTransaction } from "@/lib/actions/transactions";
import { createTransaction as seedTransaction, createUserWithData } from "@/tests/factories";
import { signInAs } from "@/tests/setup/integration";

/**
 * Regra 1 do projeto: toda query de negócio é filtrada pelo dono. Aqui provamos
 * isso com dois usuários reais no banco — o segundo tenta ler, editar, apagar e
 * criar em cima dos dados do primeiro.
 */
async function twoUsersWithATransaction() {
  const owner = await createUserWithData();
  const intruder = await createUserWithData();

  const transaction = await seedTransaction({
    userId: owner.user.id,
    accountId: owner.account.id,
    categoryId: owner.category.id,
    description: "Aluguel do escritório",
    amount: 4500,
  });

  return { owner, intruder, transaction };
}

function payloadFor(categoryId: string, accountId: string) {
  return {
    description: "Lançamento alterado pelo invasor",
    amount: "1,00",
    type: "expense",
    status: "completed",
    categoryId,
    accountId,
    date: "2026-06-20",
  };
}

describe("isolamento de lançamentos entre usuários", () => {
  it("o dono lê o próprio lançamento", async () => {
    const { owner, transaction } = await twoUsersWithATransaction();
    signInAs(owner);

    const found = await getTransaction(transaction.id);

    expect(found?.id).toBe(transaction.id);
    expect(found?.description).toBe("Aluguel do escritório");
  });

  it("outro usuário não enxerga o lançamento", async () => {
    const { intruder, transaction } = await twoUsersWithATransaction();
    signInAs(intruder);

    expect(await getTransaction(transaction.id)).toBeNull();
  });

  it("outro usuário não consegue editar, e o registro fica intacto", async () => {
    const { intruder, transaction } = await twoUsersWithATransaction();
    signInAs(intruder);

    const result = await updateTransaction({
      id: transaction.id,
      data: payloadFor(intruder.category.id, intruder.account.id),
    });

    expect(result.ok).toBe(false);

    const stored = await prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    expect(stored.description).toBe("Aluguel do escritório");
    expect(Number(stored.amount)).toBe(4500);
    expect(stored.userId).toBe(transaction.userId);
  });

  it("outro usuário não consegue excluir, e o registro continua no banco", async () => {
    const { intruder, transaction } = await twoUsersWithATransaction();
    signInAs(intruder);

    const result = await deleteTransaction(transaction.id);

    expect(result.ok).toBe(false);
    expect(await prisma.transaction.count({ where: { id: transaction.id } })).toBe(1);
  });

  it("não dá para criar lançamento com a categoria e a conta de outro usuário", async () => {
    const { owner, intruder } = await twoUsersWithATransaction();
    signInAs(intruder);

    const result = await createTransaction(payloadFor(owner.category.id, owner.account.id));

    expect(result.ok).toBe(false);
    expect(await prisma.transaction.count({ where: { userId: intruder.user.id } })).toBe(0);
  });

  it("sem sessão, nada é lido nem escrito", async () => {
    const { transaction } = await twoUsersWithATransaction();

    await expect(getTransaction(transaction.id)).rejects.toMatchObject({ code: "NAO_AUTENTICADO" });

    const result = await deleteTransaction(transaction.id);
    expect(result.ok).toBe(false);
    expect(await prisma.transaction.count({ where: { id: transaction.id } })).toBe(1);
  });
});
