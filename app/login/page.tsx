import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/layout/logo";
import { ShieldCheck, TrendingUp, Wallet } from "lucide-react";

export const metadata: Metadata = { title: "Entrar" };

const HIGHLIGHTS = [
  { icon: TrendingUp, title: "Projeção de caixa em 90 dias", body: "Cenários atualizados a cada conciliação bancária." },
  { icon: Wallet, title: "Contas consolidadas", body: "Bancos, cartões e aplicações em uma única visão." },
  { icon: ShieldCheck, title: "Trilha de auditoria", body: "Cada lançamento com origem, responsável e status." },
];

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Coluna de marca */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-surface p-10 lg:flex">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 60% at 20% 10%, hsl(var(--brand) / 0.22), transparent 65%), radial-gradient(60% 60% at 90% 90%, hsl(var(--violet) / 0.18), transparent 65%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <Logo />
        </div>

        <div className="relative space-y-8">
          <div className="space-y-3">
            <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-foreground">
              O painel financeiro que o seu time de finanças abre antes do café.
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Receita, despesa, margem e projeção de caixa em tempo real — sem planilha intermediária.
            </p>
          </div>

          <ul className="space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised text-brand">
                  <item.icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-subtle">
          Dados exibidos são fictícios, gerados para demonstração do produto.
        </p>
      </section>

      {/* Coluna do formulário */}
      <section className="flex items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <Suspense fallback={<div className="h-80" />}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
