"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, ShieldCheck, Tags, User } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings", label: "Perfil", icon: User },
  { href: "/settings/categories", label: "Categorias", icon: Tags },
  { href: "/settings/accounts", label: "Contas", icon: CreditCard },
  { href: "/settings/security", label: "Segurança", icon: ShieldCheck },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Seções das configurações" className="overflow-x-auto">
      <ul className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-raised p-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
