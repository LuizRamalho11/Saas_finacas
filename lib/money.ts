import { Prisma } from "@prisma/client";

/**
 * Dinheiro em `Decimal`, nunca em `number` (F16).
 *
 * `0.1 + 0.2` não dá `0.3` em ponto flutuante. Somando centenas de lançamentos
 * em JavaScript, o erro aparece nos centavos de um total que o usuário compara
 * com o extrato do banco — e um relatório financeiro que erra centavo perde a
 * confiança inteira.
 *
 * A regra: some e subtraia com `Decimal`; converta para `number` só na borda,
 * quando o valor vai virar pixel de gráfico ou texto formatado.
 */
export type Money = Prisma.Decimal;

export const ZERO: Money = new Prisma.Decimal(0);

export function money(value: Prisma.Decimal | string | number | null | undefined): Money {
  if (value === null || value === undefined) return ZERO;
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function addMoney(a: Money, b: Money): Money {
  return a.plus(b);
}

export function subtractMoney(a: Money, b: Money): Money {
  return a.minus(b);
}

export function sumMoney(values: (Prisma.Decimal | string | number | null | undefined)[]): Money {
  return values.reduce<Money>((total, value) => total.plus(money(value)), ZERO);
}

export function negateMoney(value: Money): Money {
  return value.negated();
}

/** Converte para número — use só na borda (gráfico, JSON da interface). */
export function toNumber(value: Prisma.Decimal | string | number | null | undefined): number {
  return money(value).toNumber();
}

/** Divisão para média e ticket: o resultado já é aproximação, não saldo. */
export function divideMoney(value: Money, divisor: number): Money {
  if (divisor === 0) return ZERO;
  return value.dividedBy(divisor);
}
