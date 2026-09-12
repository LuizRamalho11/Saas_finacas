import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { confirmImport, exportTransactionsCsv, previewImport } from "@/lib/actions/transactions";
import { createCategory, createTransaction, createUserWithData } from "@/tests/factories";
import { signInAs } from "@/tests/setup/integration";

/**
 * T1.6 — F06 (a confirmação aceitava valores, tipo e ids vindos do cliente) e
 * F07 (descrição começando com "=" virava fórmula ao abrir a exportação).
 */
function linha(overrides: Partial<Record<string, string>> = {}) {
  return {
    date: "2026-06-15",
    description: "Assinatura de software",
    amount: "199,90",
    type: "saída",
    category: "Software",
    account: "Conta corrente",
    ...overrides,
  };
}

async function cenario() {
  const scenario = await createUserWithData();
  await prisma.category.update({ where: { id: scenario.category.id }, data: { name: "Software" } });
  await prisma.account.update({ where: { id: scenario.account.id }, data: { name: "Conta corrente" } });
  signInAs(scenario);
  return scenario;
}

describe("importação de CSV", () => {
  it("importa as linhas válidas do arquivo", async () => {
    const { user } = await cenario();

    const result = await confirmImport([linha()]);

    expect(result.ok).toBe(true);
    const gravadas = await prisma.transaction.findMany({ where: { userId: user.id } });
    expect(gravadas).toHaveLength(1);
    expect(Number(gravadas[0].amount)).toBe(199.9);
    expect(gravadas[0].type).toBe("expense");
  });

  it("ignora campos que o cliente tente injetar junto da linha", async () => {
    const outroUsuario = await createUserWithData();
    const { user } = await cenario();

    // Payload adulterado: ids de outro usuário, valor negativo e tipo trocado.
    const adulterada = {
      ...linha(),
      categoryId: outroUsuario.category.id,
      accountId: outroUsuario.account.id,
      amountValue: -999,
      type: "saída",
    };

    const result = await confirmImport([adulterada]);
    expect(result.ok).toBe(true);

    const gravadas = await prisma.transaction.findMany({ where: { userId: user.id } });
    expect(gravadas).toHaveLength(1);
    // Valeu o que o servidor resolveu pelo nome, não o que veio no payload.
    const categoriaDoDono = await prisma.category.findFirstOrThrow({
      where: { userId: user.id, name: "Software" },
    });
    expect(gravadas[0].categoryId).toBe(categoriaDoDono.id);
    expect(Number(gravadas[0].amount)).toBe(199.9);

    const doOutro = await prisma.transaction.count({ where: { userId: outroUsuario.user.id } });
    expect(doOutro).toBe(0);
  });

  it("recusa valor negativo e data absurda", async () => {
    const { user } = await cenario();

    const result = await confirmImport([
      linha({ amount: "-999,00" }),
      linha({ date: "2099-01-01", description: "Muito no futuro" }),
    ]);

    expect(result.ok).toBe(false);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
  });

  it("recusa categoria de tipo incompatível com o lançamento", async () => {
    const { user } = await cenario();
    await createCategory(user.id, { name: "Receitas", type: "income" });

    const preview = await previewImport([linha({ category: "Receitas" })]);

    expect(preview.ok).toBe(true);
    expect(preview.ok && preview.data.valid).toHaveLength(0);
    expect(preview.ok && preview.data.invalid[0].error).toMatch(/entrada/);
  });

  it("recusa arquivo acima do teto de linhas", async () => {
    await cenario();

    const result = await confirmImport(Array.from({ length: 5_001 }, () => linha()));

    expect(result.ok).toBe(false);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("linha inválida é ignorada e as válidas entram na mesma transação", async () => {
    const { user } = await cenario();

    const result = await confirmImport([linha(), linha({ category: "Categoria que não existe" })]);

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.ignored).toBe(1);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(1);
  });
});

describe("exportação de CSV", () => {
  it("neutraliza descrição que viraria fórmula no Excel (F07)", async () => {
    const scenario = await cenario();
    await createTransaction({
      userId: scenario.user.id,
      accountId: scenario.account.id,
      categoryId: scenario.category.id,
      description: '=HYPERLINK("http://site-malicioso.com")',
    });

    const result = await exportTransactionsCsv({});

    expect(result.ok).toBe(true);
    const csv = result.ok ? result.data.csv : "";
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain(';"=HYPERLINK');
  });

  it("sai com BOM para o Excel abrir os acentos", async () => {
    await cenario();
    const result = await exportTransactionsCsv({});

    expect(result.ok && result.data.csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("exporta apenas os lançamentos do próprio usuário", async () => {
    const outro = await createUserWithData();
    await createTransaction({
      userId: outro.user.id,
      accountId: outro.account.id,
      categoryId: outro.category.id,
      description: "Segredo do outro usuário",
    });

    const scenario = await cenario();
    await createTransaction({
      userId: scenario.user.id,
      accountId: scenario.account.id,
      categoryId: scenario.category.id,
      description: "Lançamento próprio",
    });

    const result = await exportTransactionsCsv({});
    const csv = result.ok ? result.data.csv : "";

    expect(csv).toContain("Lançamento próprio");
    expect(csv).not.toContain("Segredo do outro usuário");
  });
});
