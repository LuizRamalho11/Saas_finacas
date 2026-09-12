import { describe, expect, it } from "vitest";
import { parseAmount } from "@/lib/validation";

describe("parseAmount", () => {
  it("entende o formato brasileiro", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("R$ 1.234,56")).toBe(1234.56);
    expect(parseAmount("0,99")).toBe(0.99);
  });

  it("entende o formato com ponto decimal", () => {
    expect(parseAmount("1234.56")).toBe(1234.56);
    expect(parseAmount("1234")).toBe(1234);
  });

  it("devolve número quando já recebe número", () => {
    expect(parseAmount(1234.56)).toBe(1234.56);
  });

  it("devolve NaN para o que não é valor", () => {
    expect(parseAmount("abc")).toBeNaN();
    expect(parseAmount(null)).toBeNaN();
    expect(parseAmount(undefined)).toBeNaN();
    expect(parseAmount({})).toBeNaN();
  });
});
