"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface NavLinksProps {
  /** Só ícones (sidebar recolhida em telas médias). */
  compact?: boolean;
  onNavigate?: () => void;
}

export function NavLinks({ compact = false, onNavigate }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={compact ? item.label : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              active
                ? "bg-brand/12 font-medium text-foreground"
                : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
              compact && "justify-center px-0 py-2.5",
            )}
          >
            {/* Barra lateral colorida marca o item ativo */}
            <span
              className={cn(
                "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
              aria-hidden
            />
            <Icon className={cn("size-[18px] shrink-0", active ? "text-brand" : "text-muted-foreground")} aria-hidden />
            {!compact && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
