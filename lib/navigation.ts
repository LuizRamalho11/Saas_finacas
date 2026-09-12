import { ArrowLeftRight, BarChart3, LayoutDashboard, Settings, Waves, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Rótulo curto usado na barra inferior do mobile. */
  short: string;
  description: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Visão geral",
    short: "Visão",
    description: "KPIs, receita e despesas do período",
    icon: LayoutDashboard,
  },
  {
    href: "/cash-flow",
    label: "Fluxo de caixa",
    short: "Caixa",
    description: "Saldo realizado e projeção de 90 dias",
    icon: Waves,
  },
  {
    href: "/transactions",
    label: "Transações",
    short: "Extrato",
    description: "Lançamentos com busca e filtros",
    icon: ArrowLeftRight,
  },
  {
    href: "/reports",
    label: "Relatórios",
    short: "Relatos",
    description: "Comparativos mês a mês e ano a ano",
    icon: BarChart3,
  },
  {
    href: "/settings",
    label: "Configurações",
    short: "Ajustes",
    description: "Perfil, moeda e aparência",
    icon: Settings,
  },
];
