"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Laptop, LogOut, Monitor, ShieldAlert, Smartphone, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { revokeOtherSessions } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";
import type { LoginRecord } from "@/types";

/** Extrai um nome legível de dispositivo/navegador do user-agent. */
function describeDevice(userAgent: string | null) {
  if (!userAgent) return { label: "Dispositivo desconhecido", icon: Monitor };

  const isMobile = /iPhone|Android|Mobile/i.test(userAgent);
  const os = /iPhone|iPad/i.test(userAgent)
    ? "iOS"
    : /Android/i.test(userAgent)
      ? "Android"
      : /Mac OS X/i.test(userAgent)
        ? "macOS"
        : /Windows/i.test(userAgent)
          ? "Windows"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Sistema desconhecido";

  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /OPR\//i.test(userAgent)
      ? "Opera"
      : /Chrome\//i.test(userAgent)
        ? "Chrome"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : /Firefox\//i.test(userAgent)
            ? "Firefox"
            : "Navegador";

  return { label: `${browser} · ${os}`, icon: isMobile ? Smartphone : Laptop };
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(from: string, to: string | null) {
  if (!to) return "sessão em aberto";
  const minutes = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function SecurityPanel({ history }: { history: LoginRecord[] }) {
  const router = useRouter();
  const [revoking, setRevoking] = React.useState(false);

  const successes = history.filter((entry) => entry.success);
  const failures = history.filter((entry) => !entry.success);
  const activeSessions = successes.filter((entry) => !entry.logoutAt).length;

  async function handleRevoke() {
    setRevoking(true);
    const result = await revokeOtherSessions();
    setRevoking(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? "Sessões encerradas.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground">Acessos registrados</p>
          <p className="mt-1.5 text-kpi font-semibold tabular text-foreground">{history.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground">Sessões em aberto</p>
          <p className="mt-1.5 text-kpi font-semibold tabular text-foreground">{activeSessions}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground">Tentativas malsucedidas</p>
          <p
            className={cn(
              "mt-1.5 text-kpi font-semibold tabular",
              failures.length > 0 ? "text-warning" : "text-foreground",
            )}
          >
            {failures.length}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Histórico de acessos</CardTitle>
            <CardDescription>
              De onde sua conta foi acessada. O registro permanece mesmo depois que a sessão expira.
            </CardDescription>
          </div>
          <Button variant="secondary" size="sm" onClick={handleRevoke} disabled={revoking || activeSessions <= 1}>
            <LogOut aria-hidden />
            {revoking ? "Encerrando…" : "Encerrar outras sessões"}
          </Button>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="Nenhum acesso registrado ainda"
              description="Assim que você entrar novamente, o acesso aparecerá aqui com data, IP e dispositivo."
            />
          ) : (
            <ul className="space-y-2">
              {history.map((entry) => {
                const device = describeDevice(entry.userAgent);
                const Icon = device.icon;
                return (
                  <li
                    key={entry.id}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3",
                      entry.success ? "border-border bg-surface-raised/50" : "border-warning/25 bg-warning/[0.06]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                        entry.success ? "bg-brand/12 text-brand" : "bg-warning/15 text-warning",
                      )}
                      aria-hidden
                    >
                      <Icon className="size-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                        {device.label}
                        {entry.current ? <Badge variant="success">Sessão atual</Badge> : null}
                        {!entry.success ? <Badge variant="warning">Falhou</Badge> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(entry.loginAt)}
                        {entry.ipAddress ? ` · IP ${entry.ipAddress}` : ""}
                        {entry.reason ? ` · ${entry.reason}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {entry.success ? (
                        <>
                          <CheckCircle2 className="size-3.5 text-success" aria-hidden />
                          <span>{duration(entry.loginAt, entry.logoutAt)}</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="size-3.5 text-warning" aria-hidden />
                          <span>acesso negado</span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function SecurityPanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}
