"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import type { CurrencyCode } from "@/lib/format";

interface Preferences {
  currency: CurrencyCode;
  compactNumbers: boolean;
  weeklyDigest: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
  currency: "BRL",
  compactNumbers: true,
  weeklyDigest: true,
};

const STORAGE_KEY = "finora:preferences";

interface PreferencesContextValue extends Preferences {
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = React.createContext<PreferencesContextValue>({
  ...DEFAULT_PREFERENCES,
  setPreference: () => {},
});

export function usePreferences() {
  return React.useContext(PreferencesContext);
}

function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = React.useState<Preferences>(DEFAULT_PREFERENCES);

  // Lido só no cliente para não divergir do HTML renderizado no servidor.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(raw) });
    } catch {
      /* preferências são um conforto: falhar em silêncio é aceitável */
    }
  }, []);

  const setPreference = React.useCallback<PreferencesContextValue["setPreference"]>((key, value) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignora quotas/modo privado */
      }
      return next;
    });
  }, []);

  const value = React.useMemo(() => ({ ...preferences, setPreference }), [preferences, setPreference]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <PreferencesProvider>
        {children}
        {/* Toasts herdam os tokens do tema para não destoarem dos cards */}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!bg-surface !border-border !text-foreground !shadow-pop !rounded-lg",
              description: "!text-muted-foreground",
              actionButton: "!bg-brand !text-brand-foreground",
              cancelButton: "!bg-surface-raised !text-muted-foreground",
              error: "!border-danger/40",
              success: "!border-success/30",
            },
          }}
        />
      </PreferencesProvider>
    </ThemeProvider>
  );
}
