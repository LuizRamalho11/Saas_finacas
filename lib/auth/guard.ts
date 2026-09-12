import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  company: string;
  currency: string;
  timezone: string;
  sessionId?: string;
}

/**
 * Fonte única de verdade da autorização. Toda Server Action e toda página
 * autenticada passa por aqui — nenhuma query roda sem um userId conhecido.
 * Lança quando não há sessão, para que uma action nunca escreva sem dono.
 */
export async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("NAO_AUTENTICADO");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    // passwordHash jamais sai do banco para a aplicação
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      company: true,
      currency: true,
      timezone: true,
    },
  });

  if (!user) throw new Error("NAO_AUTENTICADO");

  return { ...user, sessionId: session.user.sessionId };
}

/** Versão para páginas: em vez de lançar, manda para o login. */
export async function requireUserPage(): Promise<CurrentUser> {
  try {
    return await requireUser();
  } catch {
    redirect("/login");
  }
}

/** Usuário atual quando existir, sem exigir autenticação. */
export async function optionalUser(): Promise<CurrentUser | null> {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}
