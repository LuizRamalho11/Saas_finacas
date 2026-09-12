"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";
import { usePeriod } from "./period-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIOD_LABEL } from "@/lib/periods";
import { logoutAction } from "@/lib/actions/auth";
import { NAV_ITEMS } from "@/lib/navigation";
import type { Period, UserProfile } from "@/types";

interface TopbarProps {
  accounts: { id: string; label: string }[];
  profile: UserProfile;
}

export function Topbar({ accounts, profile }: TopbarProps) {
  const pathname = usePathname();
  const { period, setPeriod, accountId, setAccountId } = usePeriod();
  const current = NAV_ITEMS.find((item) => pathname.startsWith(item.href));

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-canvas/80 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <MobileNav />

        <div className="min-w-0 flex-1 shrink">
          <h1 className="truncate text-sm font-semibold text-foreground sm:text-base">
            {current?.label ?? "Visão geral"}
          </h1>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">{current?.description}</p>
        </div>

        <label className="relative hidden lg:block">
          <span className="sr-only">Buscar transações</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input placeholder="Buscar lançamento, cliente…" className="w-56 pl-9 xl:w-64" />
        </label>

        <div className="hidden sm:block">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-[9.5rem] shrink-0" aria-label="Filtrar por conta">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
          <SelectTrigger className="w-[6.75rem] shrink-0 sm:w-[8.5rem]" aria-label="Selecionar período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABEL) as Period[]).map((value) => (
              <SelectItem key={value} value={value}>
                {PERIOD_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" className="relative hidden sm:inline-flex" aria-label="Notificações (3 não lidas)">
          <Bell aria-hidden />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-coral" aria-hidden />
        </Button>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-full transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              aria-label={`Menu da conta de ${profile.name}`}
            >
              <Avatar>
                <AvatarFallback>{profile.initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {profile.name}
              <span className="mt-0.5 block font-normal text-muted-foreground">{profile.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Preferências</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/reports">Relatórios salvos</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/security">Histórico de acessos</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <form action={logoutAction}>
                <button type="submit" className="w-full text-left">
                  Sair da conta
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
