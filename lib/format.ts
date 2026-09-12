export type CurrencyCode = "BRL" | "USD" | "EUR";

const LOCALE_BY_CURRENCY: Record<CurrencyCode, string> = {
  BRL: "pt-BR",
  USD: "en-US",
  EUR: "de-DE",
};

export function formatCurrency(value: number, currency: CurrencyCode = "BRL", options: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}

/** Versão curta para eixos e KPIs grandes: R$ 1,2 mi */
export function formatCompact(value: number, currency: CurrencyCode = "BRL") {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const symbol = currency === "BRL" ? "R$" : currency === "USD" ? "$" : "€";
  const nf = (n: number, d = 1) =>
    new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
      minimumFractionDigits: 0,
      maximumFractionDigits: d,
    }).format(n);

  if (abs >= 1_000_000) return `${sign}${symbol} ${nf(abs / 1_000_000)} mi`;
  if (abs >= 1_000) return `${sign}${symbol} ${nf(abs / 1_000)} mil`;
  return `${sign}${symbol} ${nf(abs, 0)}`;
}

export function formatPercent(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits).replace(".", ",")}%`;
}

export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "12 mar" — eixos de data curtos, como nas referências. */
export function formatDayShort(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "mar/25" */
export function formatMonthShort(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return `${MONTHS_SHORT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

/** "16 set 2026" — cabe na largura de uma coluna de tabela. */
export function formatDateCompact(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateFull(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
