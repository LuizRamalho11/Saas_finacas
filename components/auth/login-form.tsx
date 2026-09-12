"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/lib/actions/auth";
import { safeRedirect } from "@/lib/safe-redirect";

export interface DemoCredentials {
  email: string;
  password: string;
}

/**
 * `demo` só chega preenchido quando o servidor está em APP_MODE=demo (F10).
 * Em produção o formulário abre vazio e sem aviso de demonstração.
 */
export function LoginForm({ demo }: { demo?: DemoCredentials | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // F02: o parâmetro vem da URL, então é do atacante até prova em contrário.
  const redirectTo = safeRedirect(searchParams.get("redirectTo"));
  const expired = searchParams.get("expired") === "1";

  const [email, setEmail] = React.useState(demo?.email ?? "");
  const [password, setPassword] = React.useState(demo?.password ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await loginAction({ email, password });

    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      setSubmitting(false);
      return;
    }

    // O cookie de sessão já foi gravado; refresh garante que o middleware o veja.
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Entrar na sua conta</h1>
        {demo ? (
          <p className="text-sm text-muted-foreground">
            Ambiente de demonstração — as credenciais do seed já vêm preenchidas.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Entre com o e-mail e a senha da sua conta.</p>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail corporativo</Label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="pl-9"
              aria-invalid={Boolean(error || fieldErrors.email)}
            />
          </div>
          {fieldErrors.email ? (
            <p role="alert" className="text-xs text-danger">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <button type="button" className="text-xs text-brand hover:underline">
              Esqueci minha senha
            </button>
          </div>
          <div className="relative">
            <LockKeyhole
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pl-9"
              aria-invalid={Boolean(error || fieldErrors.password)}
            />
          </div>
          {fieldErrors.password ? (
            <p role="alert" className="text-xs text-danger">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>
      </div>

      {expired && !error ? (
        <p role="status" className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
          Sua sessão anterior não é mais válida. Entre novamente para continuar.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {submitting ? "Entrando…" : "Entrar no painel"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Toda tentativa de acesso, bem-sucedida ou não, fica registrada no histórico da conta.
      </p>
    </form>
  );
}
