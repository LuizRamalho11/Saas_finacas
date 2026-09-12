"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme !== "light";

  // Antes de montar, servidor e cliente precisam produzir exatamente o mesmo
  // markup — só depois é que sabemos qual tema está ativo.
  const label = mounted ? (isDark ? "Ativar tema claro" : "Ativar tema escuro") : "Alternar tema";

  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(isDark ? "light" : "dark")} aria-label={label}>
      {/* Antes de montar não sabemos o tema: renderiza neutro para não piscar */}
      {mounted && !isDark ? <Moon aria-hidden /> : <Sun aria-hidden />}
    </Button>
  );
}
