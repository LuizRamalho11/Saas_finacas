export type Period = "30d" | "90d" | "365d";

export type TransactionStatus = "pending" | "completed" | "canceled";

export type TransactionType = "income" | "expense";

export interface DailyPoint {
  /** ISO yyyy-mm-dd */
  date: string;
  revenue: number;
  expense: number;
}

export interface CashFlowPoint {
  date: string;
  /** Saldo realizado — nulo no futuro */
  actual: number | null;
  /** Projeção — nula no passado (exceto no ponto de emenda) */
  projected: number | null;
  inflow: number;
  outflow: number;
}

export interface MonthlyPoint {
  /** ISO yyyy-mm-01 */
  month: string;
  revenue: number;
  expense: number;
  profit: number;
}

export interface CategorySlice {
  id: string;
  label: string;
  /** Rótulo curto para eixos estreitos. */
  short: string;
  amount: number;
  share: number;
  /** Hex vindo de `Category.color` — validado para contraste nos dois temas. */
  color: string;
  trend: number;
}

export interface RevenueSource {
  id: string;
  label: string;
  amount: number;
  share: number;
  color: string;
}

export interface Account {
  id: string;
  label: string;
  institution: string;
  balance: number;
  kind: "checking" | "savings" | "card" | "investment";
}

export interface Transaction {
  id: string;
  /** ISO yyyy-mm-dd */
  date: string;
  description: string;
  counterparty: string;
  categoryId: string;
  categoryLabel: string;
  categoryColor: string | null;
  accountId: string;
  accountLabel: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  method: string;
  notes: string | null;
  /** ISO completo — alimenta o histórico de alterações no painel de detalhe. */
  createdAt: string;
  updatedAt: string;
}

export interface Kpi {
  id: string;
  label: string;
  value: number;
  previousValue: number;
  change: number;
  format: "currency" | "percent" | "number";
  hint: string;
  colorVar: string;
  spark: { date: string; value: number }[];
  /** true quando cair é bom (ex.: despesas) */
  inverse?: boolean;
}

export interface Goal {
  id: string;
  label: string;
  caption: string;
  value: number;
  target: number;
  progress: number;
  colorVar: string;
  /** Progresso esperado até a data de hoje (0..1), quando a meta é temporal. */
  expected?: number;
  /** Detalhe curto exibido abaixo do medidor. */
  detail?: string;
}

export interface UserProfile {
  name: string;
  role: string;
  email: string;
  company: string;
  initials: string;
  timezone: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string | null;
  transactionCount: number;
  total: number;
}

export interface AccountRecord {
  id: string;
  name: string;
  type: string;
  institution: string;
  openingBalance: number;
  balance: number;
  transactionCount: number;
  archived: boolean;
}

export interface LoginRecord {
  id: string;
  loginAt: string;
  logoutAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  reason: string | null;
  /** true quando corresponde à sessão que está aberta agora. */
  current: boolean;
}
