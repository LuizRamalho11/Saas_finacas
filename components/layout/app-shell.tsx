import { redirect } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileTabbar } from "./mobile-tabbar";
import { PeriodProvider } from "./period-context";
import { getAccounts, getProfile } from "@/lib/api";

/**
 * Moldura das páginas autenticadas. Roda no servidor para carregar contas e
 * perfil uma única vez e entregá-los prontos ao header (client component).
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  let accounts;
  let profile;

  try {
    [accounts, profile] = await Promise.all([getAccounts(), getProfile()]);
  } catch {
    // Cookie assinado válido, mas o usuário não existe mais (banco recriado,
    // conta removida). Passamos pela rota que apaga o cookie: mandar direto
    // para /login criaria um laço, já que o middleware veria o cookie e
    // devolveria para cá.
    redirect("/api/session/expired");
  }

  return (
    <PeriodProvider>
      <div className="aurora min-h-screen bg-canvas">
        <Sidebar />
        <div className="relative z-10 md:pl-[72px] xl:pl-64">
          <Topbar accounts={accounts.map((account) => ({ id: account.id, label: account.label }))} profile={profile} />
          <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 pb-24 pt-6 sm:px-6 md:pb-10">{children}</main>
        </div>
        <MobileTabbar />
      </div>
    </PeriodProvider>
  );
}
