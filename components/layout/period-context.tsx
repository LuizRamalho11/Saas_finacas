"use client";

import * as React from "react";
import type { Period } from "@/types";

interface PeriodContextValue {
  period: Period;
  setPeriod: (period: Period) => void;
  accountId: string;
  setAccountId: (accountId: string) => void;
}

const PeriodContext = React.createContext<PeriodContextValue | null>(null);

/** Período e conta selecionados no header valem para todas as páginas. */
export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [period, setPeriod] = React.useState<Period>("90d");
  const [accountId, setAccountId] = React.useState("all");

  const value = React.useMemo(() => ({ period, setPeriod, accountId, setAccountId }), [period, accountId]);

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod() {
  const context = React.useContext(PeriodContext);
  if (!context) throw new Error("usePeriod precisa estar dentro de <PeriodProvider>");
  return context;
}
