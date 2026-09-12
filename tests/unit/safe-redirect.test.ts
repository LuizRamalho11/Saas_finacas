import { describe, expect, it } from "vitest";
import { safeRedirect } from "@/lib/safe-redirect";

const NUL = String.fromCharCode(0);
const QUEBRA_DE_LINHA = String.fromCharCode(10);
const BARRA_INVERTIDA = String.fromCharCode(92);

describe("safeRedirect", () => {
  it("deixa passar caminho interno conhecido", () => {
    expect(safeRedirect("/transactions")).toBe("/transactions");
    expect(safeRedirect("/transactions?x=1")).toBe("/transactions?x=1");
    expect(safeRedirect("/settings/security")).toBe("/settings/security");
    expect(safeRedirect("/cash-flow#topo")).toBe("/cash-flow#topo");
  });

  it("bloqueia os destinos externos do achado F02", () => {
    expect(safeRedirect("//site-malicioso.com")).toBe("/dashboard");
    expect(safeRedirect(`/${BARRA_INVERTIDA}site-malicioso.com`)).toBe("/dashboard");
    expect(safeRedirect("https://site-malicioso.com")).toBe("/dashboard");
    expect(safeRedirect("javascript:alert(1)")).toBe("/dashboard");
    expect(safeRedirect("/%2F%2Fsite-malicioso.com")).toBe("/dashboard");
    expect(safeRedirect("/%5Csite-malicioso.com")).toBe("/dashboard");
    expect(safeRedirect("http:/site-malicioso.com")).toBe("/dashboard");
  });

  it("bloqueia caminho interno fora da lista", () => {
    expect(safeRedirect("/api/session/expired")).toBe("/dashboard");
    expect(safeRedirect("/login")).toBe("/dashboard");
    expect(safeRedirect("/transactionsX")).toBe("/dashboard");
  });

  it("bloqueia truques de espaço em branco, controle e tamanho", () => {
    expect(safeRedirect(" /dashboard")).toBe("/dashboard");
    expect(safeRedirect(`/dash${QUEBRA_DE_LINHA}board`)).toBe("/dashboard");
    expect(safeRedirect(`/transactions${NUL}`)).toBe("/dashboard");
    expect(safeRedirect(`/transactions?x=${"a".repeat(600)}`)).toBe("/dashboard");
  });

  it("lida com entrada que não é texto", () => {
    expect(safeRedirect(undefined)).toBe("/dashboard");
    expect(safeRedirect(null)).toBe("/dashboard");
    expect(safeRedirect(42)).toBe("/dashboard");
    expect(safeRedirect("")).toBe("/dashboard");
    expect(safeRedirect("%E0%A4%A")).toBe("/dashboard");
  });

  it("respeita o fallback informado", () => {
    expect(safeRedirect("//site-malicioso.com", "/settings")).toBe("/settings");
  });
});
