/**
 * Paleta de categorias persistida no banco (coluna `Category.color`).
 * Como o hex é fixo e o produto tem tema claro e escuro, cada cor foi escolhida
 * com contraste >= 3:1 tanto sobre a superfície escura (#131A2B) quanto sobre
 * o branco — nenhuma delas some ao trocar de tema.
 */
export const CATEGORY_COLORS = [
  { id: "indigo", label: "Índigo", hex: "#5B7CFA" },
  { id: "azure", label: "Azul", hex: "#3B9BE0" },
  { id: "teal", label: "Turquesa", hex: "#12A594" },
  { id: "violet", label: "Violeta", hex: "#9061F9" },
  { id: "coral", label: "Coral", hex: "#EE6136" },
  { id: "emerald", label: "Esmeralda", hex: "#0E9E72" },
  { id: "amber", label: "Âmbar", hex: "#BC8000" },
  { id: "rose", label: "Rosa", hex: "#E8517A" },
  { id: "slate", label: "Ardósia", hex: "#7C8DB5" },
] as const;

export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLORS[0].hex;

/** Cor de fallback estável para categorias sem cor definida. */
export function colorForIndex(index: number) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length].hex;
}

export function isValidHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
