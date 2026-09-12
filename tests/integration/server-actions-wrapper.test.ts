import { describe, expect, it } from "vitest";
import { WRAPPED } from "@/lib/server/action";
import { AppError } from "@/lib/server/errors";
import * as api from "@/lib/api";
import * as accounts from "@/lib/actions/accounts";
import * as authActions from "@/lib/actions/auth";
import * as categories from "@/lib/actions/categories";
import * as transactions from "@/lib/actions/transactions";
import { createUserWithData } from "@/tests/factories";
import { signInAs } from "@/tests/setup/integration";

/**
 * Aceite da T1.1: tudo que sai de um arquivo `"use server"` é endpoint público,
 * então nada pode ficar fora do wrapper — é ele que garante sessão, validação e
 * limite. Este teste falha no dia em que alguém exportar uma função crua.
 */
const SERVER_MODULES: Record<string, Record<string, unknown>> = {
  "lib/api.ts": api,
  "lib/actions/accounts.ts": accounts,
  "lib/actions/auth.ts": authActions,
  "lib/actions/categories.ts": categories,
  "lib/actions/transactions.ts": transactions,
};

describe("cobertura do defineAction", () => {
  for (const [file, module] of Object.entries(SERVER_MODULES)) {
    it(`toda função exportada de ${file} passa pelo wrapper`, () => {
      const exported = Object.entries(module).filter(([, value]) => typeof value === "function");
      expect(exported.length).toBeGreaterThan(0);

      const unwrapped = exported.filter(([, value]) => !(WRAPPED in (value as object))).map(([name]) => name);
      expect(unwrapped).toEqual([]);
    });
  }
});

describe("limites dos parâmetros de leitura (F05)", () => {
  it("getTransactions recusa pageSize absurdo", async () => {
    const scenario = await createUserWithData();
    signInAs(scenario);

    await expect(api.getTransactions({ pageSize: 1_000_000 })).rejects.toBeInstanceOf(AppError);
    await expect(api.getTransactions({ pageSize: 1_000_000 })).rejects.toMatchObject({
      code: "DADOS_INVALIDOS",
    });
  });

  it("getTransactions aceita um pageSize dentro do limite", async () => {
    const scenario = await createUserWithData();
    signInAs(scenario);

    const page = await api.getTransactions({ pageSize: 50 });
    expect(page.rows).toEqual([]);
  });

  it("getMonthlySeries recusa um intervalo gigante", async () => {
    const scenario = await createUserWithData();
    signInAs(scenario);

    await expect(api.getMonthlySeries(10_000)).rejects.toMatchObject({ code: "DADOS_INVALIDOS" });
  });

  it("getRecentTransactions recusa limite acima de 50", async () => {
    const scenario = await createUserWithData();
    signInAs(scenario);

    await expect(api.getRecentTransactions(5_000)).rejects.toMatchObject({ code: "DADOS_INVALIDOS" });
  });

  it("filtro de período inválido é recusado antes de chegar ao banco", async () => {
    const scenario = await createUserWithData();
    signInAs(scenario);

    await expect(api.getKpis("todos" as never)).rejects.toMatchObject({ code: "DADOS_INVALIDOS" });
  });

  it("a importação recusa arquivo acima de 5.000 linhas", async () => {
    const scenario = await createUserWithData();
    const { account, category } = scenario;
    signInAs(scenario);

    const row = {
      description: "Assinatura",
      amount: "10,00",
      type: "saída",
      date: "2026-06-15",
      category: category.name,
      account: account.name,
    };

    const result = await transactions.previewImport(Array.from({ length: 5_001 }, () => row));
    expect(result.ok).toBe(false);
  });
});

describe("mensagens de erro não vazam detalhe interno", () => {
  it("sem sessão, a mutação devolve mensagem de sessão expirada", async () => {
    const result = await accounts.createAccount({ name: "Conta nova", type: "checking", openingBalance: "0" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/sessão expirou/i);
  });
});
