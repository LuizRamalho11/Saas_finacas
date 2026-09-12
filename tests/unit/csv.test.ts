import { describe, expect, it } from "vitest";
import { buildCsv, csvCell, UTF8_BOM } from "@/lib/csv";

const TAB = String.fromCharCode(9);

describe("csvCell", () => {
  it("neutraliza fórmula na exportação (F07)", () => {
    expect(csvCell('=HYPERLINK("http://site-malicioso.com")')).toBe('"\'=HYPERLINK(""http://site-malicioso.com"")"');
    expect(csvCell("+1+1")).toBe('"\'+1+1"');
    expect(csvCell("-2+3")).toBe('"\'-2+3"');
    expect(csvCell("@SUM(A1:A2)")).toBe('"\'@SUM(A1:A2)"');
    expect(csvCell(`${TAB}=1+1`)).toBe(`"'${TAB}=1+1"`);
  });

  it("escapa aspas sem estragar o texto", () => {
    expect(csvCell('Aluguel "sala 2"')).toBe('"Aluguel ""sala 2"""');
  });

  it("deixa texto comum como está", () => {
    expect(csvCell("Assinatura mensal")).toBe('"Assinatura mensal"');
    expect(csvCell("2026-06-15")).toBe('"2026-06-15"');
    expect(csvCell(1234.5)).toBe('"1234.5"');
  });

  it("trata vazio, nulo e indefinido", () => {
    expect(csvCell("")).toBe('""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});

describe("buildCsv", () => {
  it("começa com BOM e separa por ponto e vírgula", () => {
    const csv = buildCsv(["Data", "Descrição"], [["2026-06-15", "Assinatura"]]);

    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain('"Data";"Descrição"');
    expect(csv).toContain('"2026-06-15";"Assinatura"');
  });

  it("neutraliza fórmula também nas linhas", () => {
    const csv = buildCsv(["Descrição"], [["=1+1"]]);
    expect(csv).toContain('"\'=1+1"');
  });
});
