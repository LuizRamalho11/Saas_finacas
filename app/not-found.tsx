import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo />
      <div className="space-y-2">
        <p className="text-sm font-medium text-brand">Erro 404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Esta página não existe</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          O relatório que você procura pode ter sido arquivado ou renomeado.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Voltar para a visão geral</Link>
      </Button>
    </main>
  );
}
