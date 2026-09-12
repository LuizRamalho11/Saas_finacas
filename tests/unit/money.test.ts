import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { addMoney, divideMoney, money, subtractMoney, sumMoney, toNumber, ZERO } from "@/lib/money";

/**
 * F16: dinheiro vinha do banco como Decimal, virava number e era somado em
 * ponto flutuante. O caso clássico: 0,1 + 0,2 em JavaScript dá 0,30000000000000004.
 */
describe("money", () => {
  it("soma sem erro de ponto flutuante", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney(["0.1", "0.2"]).toString()).toBe("0.3");
  });

  it("soma muitos centavos sem acumular erro", () => {
    const centavos = Array.from({ length: 1000 }, () => "0.01");

    expect(sumMoney(centavos).toString()).toBe("10");
    // A mesma conta em ponto flutuante não fecha.
    expect(centavos.reduce((acc, value) => acc + Number(value), 0)).not.toBe(10);
  });

  it("aceita Decimal, texto, número, nulo e indefinido", () => {
    expect(money(new Prisma.Decimal("12.34")).toString()).toBe("12.34");
    expect(money("12.34").toString()).toBe("12.34");
    expect(money(12.34).toString()).toBe("12.34");
    expect(money(null)).toStrictEqual(ZERO);
    expect(money(undefined)).toStrictEqual(ZERO);
  });

  it("soma e subtrai preservando centavos", () => {
    expect(addMoney(money("1999.99"), money("0.01")).toString()).toBe("2000");
    expect(subtractMoney(money("2000"), money("0.01")).toString()).toBe("1999.99");
  });

  it("divide para média sem estourar em divisor zero", () => {
    expect(divideMoney(money("100"), 4).toString()).toBe("25");
    expect(divideMoney(money("100"), 0)).toStrictEqual(ZERO);
  });

  it("converte para número só quando pedido", () => {
    expect(toNumber(money("1234.56"))).toBe(1234.56);
    expect(toNumber(null)).toBe(0);
  });
});
