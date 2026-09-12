"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Rede de segurança para falhas de consulta ou de conexão com o banco. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isAuth = error.message.includes("NAO_AUTENTICADO");

  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-danger/12 text-danger">
        <AlertTriangle className="size-5" aria-hidden />
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
        {isAuth ? "Sua sessão expirou" : "Não foi possível carregar esta página"}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        {isAuth
          ? "Entre novamente para continuar de onde parou."
          : "A consulta ao banco de dados falhou. Verifique se o PostgreSQL está rodando e tente de novo."}
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-[11px] text-subtle">referência: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex justify-center gap-2">
        {isAuth ? (
          <Button asChild>
            <Link href="/login">Ir para o login</Link>
          </Button>
        ) : (
          <Button onClick={reset}>
            <RotateCcw aria-hidden /> Tentar novamente
          </Button>
        )}
        <Button variant="secondary" asChild>
          <Link href="/dashboard">Voltar à visão geral</Link>
        </Button>
      </div>
    </Card>
  );
}
