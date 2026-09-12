import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getKpis } from "@/lib/api";
import { deleteAccount } from "@/lib/actions/accounts";
import { createAccount, createTransaction, createUserWithData } from "@/tests/factories";
import { signInAs } from "@/tests/setup/integration";

/**
 * T1.8 — F14 (cascade da conta apagaria lançamentos), F15 (enums eram texto
 * livre, sem nada no banco impedindo valor inválido) e F16 (dinheiro somado em
 * ponto flutuante).
 */
describe("garantias no banco", () => {
  it("recusa valor zero ou negativo (CHECK no banco)", async () => {
    const { user, account, category } = await createUserWithData();

    const base = {
      userId: user.id,
      accountId: account.id,
      categoryId: category.id,
      description: "Tentativa inválida",
      type: "expense" as const,
      date: new Date("2026-06-15T12:00:00.000Z"),
    };

    await expect(prisma.transaction.create({ data: { ...base, amount: new Prisma.Decimal("0") } })).rejects.toThrow();
    await expect(
      prisma.transaction.create({ data: { ...base, amount: new Prisma.Decimal("-10.00") } }),
    ).rejects.toThrow();
  });

  it("recusa tipo fora do enum, mesmo por SQL direto", async () => {
    const { user, account, category } = await createUserWithData();

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "Transaction" ("id","userId","accountId","categoryId","description","amount","type","status","date","updatedAt")
         VALUES ('tx-invalida', $1, $2, $3, 'Tipo inventado', 10.00, 'transferencia', 'completed', NOW(), NOW())`,
        user.id,
        account.id,
        category.id,
      ),
    ).rejects.toThrow();
  });

  it("apagar conta com lançamentos é bloqueado pelo banco, não só pela aplicação", async () => {
    const scenario = await createUserWithData();
    await createTransaction({
      userId: scenario.user.id,
      accountId: scenario.account.id,
      categoryId: scenario.category.id,
    });

    // A aplicação já exige realocação; aqui forçamos o caminho direto do banco.
    await expect(prisma.account.delete({ where: { id: scenario.account.id } })).rejects.toThrow();

    expect(await prisma.transaction.count({ where: { accountId: scenario.account.id } })).toBe(1);
  });

  it("a exclusão de conta pela aplicação realoca em vez de apagar lançamentos", async () => {
    const scenario = await createUserWithData();
    const destino = await createAccount(scenario.user.id, { name: "Conta destino" });
    const lancamento = await createTransaction({
      userId: scenario.user.id,
      accountId: scenario.account.id,
      categoryId: scenario.category.id,
    });
    signInAs(scenario);

    const result = await deleteAccount({ id: scenario.account.id, reassignToId: destino.id });

    expect(result.ok).toBe(true);
    const movido = await prisma.transaction.findUniqueOrThrow({ where: { id: lancamento.id } });
    expect(movido.accountId).toBe(destino.id);
  });
});

describe("totais sem erro de ponto flutuante (F16)", () => {
  it("somar centavos dá o valor exato no KPI", async () => {
    const scenario = await createUserWithData();
    const receita = await prisma.category.create({
      data: { userId: scenario.user.id, name: "Receita", type: "income" },
    });
    signInAs(scenario);

    // A janela do KPI vai até a meia-noite de hoje: usamos ontem ao meio-dia,
    // que é como a aplicação grava as datas.
    const ontem = new Date(Date.now() - 86_400_000);
    ontem.setUTCHours(12, 0, 0, 0);

    for (const valor of [0.1, 0.2, 0.3]) {
      await createTransaction({
        userId: scenario.user.id,
        accountId: scenario.account.id,
        categoryId: receita.id,
        type: "income",
        amount: valor,
        date: ontem,
      });
    }

    const kpis = await getKpis("30d");
    const receitaTotal = kpis.find((kpi) => kpi.id === "revenue");

    // 0.1 + 0.2 + 0.3 em ponto flutuante dá 0.6000000000000001.
    expect(receitaTotal?.value).toBe(0.6);
  });

  it("o saldo da conta soma abertura e movimento sem perder centavo", async () => {
    const scenario = await createUserWithData();
    await prisma.account.update({
      where: { id: scenario.account.id },
      data: { openingBalance: new Prisma.Decimal("0.10") },
    });
    const receita = await prisma.category.create({
      data: { userId: scenario.user.id, name: "Receita", type: "income" },
    });
    signInAs(scenario);

    for (const valor of [0.2, 0.3]) {
      await createTransaction({
        userId: scenario.user.id,
        accountId: scenario.account.id,
        categoryId: receita.id,
        type: "income",
        amount: valor,
      });
    }

    const { getAccounts } = await import("@/lib/api");
    const contas = await getAccounts();
    const conta = contas.find((item) => item.id === scenario.account.id);

    expect(conta?.balance).toBe(0.6);
  });
});
