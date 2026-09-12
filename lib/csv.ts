/**
 * Geração de CSV segura (F07).
 *
 * Excel, LibreOffice e Google Sheets tratam uma célula que começa com "=", "+",
 * "-", "@", tabulação ou retorno de carro como fórmula. Uma descrição de
 * lançamento chamada `=HYPERLINK("http://…")` vira link clicável na planilha de
 * quem abrir o arquivo — o exportador do produto viraria o vetor de ataque.
 *
 * A defesa é prefixar a célula com apóstrofo, que a planilha lê como "isto é
 * texto" e não exibe.
 */
const TAB = String.fromCharCode(9);
const CR = String.fromCharCode(13);
const FORMULA_STARTERS = ["=", "+", "-", "@", TAB, CR];

/** Marca de ordem de bytes: sem ela o Excel abre os acentos errados. */
export const UTF8_BOM = String.fromCharCode(0xfeff);

export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const neutralized = FORMULA_STARTERS.some((starter) => text.startsWith(starter)) ? `'${text}` : text;

  // Aspas dobradas: a regra de escape do próprio formato.
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function buildCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(";"));
  return UTF8_BOM + lines.join(CR + String.fromCharCode(10));
}
