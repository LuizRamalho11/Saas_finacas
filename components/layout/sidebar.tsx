import Link from "next/link";
import { LifeBuoy, Sparkles } from "lucide-react";
import { Logo } from "./logo";
import { NavLinks } from "./nav-links";
import { Button } from "@/components/ui/button";

/**
 * Sidebar fixa. Em >=1280px mostra ícones + rótulos; entre 768px e 1279px
 * recolhe para só ícones; abaixo disso some (vira drawer no header).
 */
export function Sidebar() {
  return (
    <>
      {/* Recolhida — tablet */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-border bg-surface/70 px-3 py-5 backdrop-blur md:flex xl:hidden">
        <Link href="/dashboard" className="mb-6 flex justify-center rounded-lg" aria-label="Finora — início">
          <Logo compact />
        </Link>
        <NavLinks compact />
      </aside>

      {/* Completa — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface/70 px-4 py-5 backdrop-blur xl:flex">
        <Link href="/dashboard" className="mb-7 rounded-lg px-1" aria-label="Finora — início">
          <Logo />
        </Link>

        <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-subtle">Análise</p>
        <NavLinks />

        <div className="mt-auto space-y-3">
          <div className="rounded-card border border-border bg-gradient-to-br from-brand/12 to-violet/10 p-4">
            <span className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Sparkles className="size-4 text-brand" aria-hidden />
              Fechamento de setembro
            </span>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              4 conciliações pendentes antes do fechamento contábil.
            </p>
            <Button size="sm" className="mt-3 w-full" asChild>
              <Link href="/transactions?status=pending">Revisar agora</Link>
            </Button>
          </div>

          <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
            <Link href="/settings">
              <LifeBuoy aria-hidden />
              Central de ajuda
            </Link>
          </Button>
        </div>
      </aside>
    </>
  );
}
