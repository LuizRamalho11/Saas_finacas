import type { Period } from "@/types";

export const PERIOD_DAYS: Record<Period, number> = { "30d": 30, "90d": 90, "365d": 365 };

export const PERIOD_LABEL: Record<Period, string> = {
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  "365d": "Últimos 12 meses",
};

export const COMPARISON_LABEL: Record<Period, string> = {
  "30d": "vs. 30 dias anteriores",
  "90d": "vs. trimestre anterior",
  "365d": "vs. ano anterior",
};

const DAY_MS = 86_400_000;

export function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Janela do período selecionado. `offset` recua janelas inteiras para permitir
 * a comparação "vs. período anterior" sem duplicar a lógica em cada consulta.
 */
export function periodWindow(period: Period, offset = 0) {
  const days = PERIOD_DAYS[period];
  const today = startOfUtcDay();
  const to = addDays(today, -offset * days);
  const from = addDays(to, -(days - 1));
  return { from, to, days };
}

/** Data de hoje em ISO, segura para usar no cliente e no servidor. */
export function todayIso() {
  return toISODate(startOfUtcDay());
}

/**
 * Data de hoje no fuso do navegador. Usada como padrão em formulários: às 22h
 * em São Paulo o dia UTC já virou, e sugerir amanhã confundiria o usuário.
 * As agregações continuam em UTC, o que é coerente porque os lançamentos são
 * gravados ao meio-dia UTC — mesmo dia do calendário nos dois fusos.
 */
export function localTodayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
