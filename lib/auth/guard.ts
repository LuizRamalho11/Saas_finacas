import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { closeSession } from "@/lib/auth/session-log";
import { AppError } from "@/lib/server/errors";

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

/** Sessão parada por mais que isto é encerrada, mesmo dentro da validade. */
const IDLE_LIMIT_MS = 12 * 60 * 60 * 1000;

/** `lastSeenAt` é gravado no máximo uma vez a cada 5 minutos. */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Fonte única de verdade da autorização. Toda Server Action e toda página
 * autenticada passa por aqui — nenhuma query roda sem um userId conhecido.
 *
 * O cookie do Auth.js é um JWT: ele continua "válido" até vencer, mesmo depois
 * de um logout ou de "encerrar outras sessões" (F01). Por isso o token carrega
 * um `sessionId` e aqui conferimos a linha correspondente em `Session`: revogar
 * a sessão no banco passa a derrubar o cookie na requisição seguinte.
 */
export async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  const userId = session?.user?.id;
  const sessionId = session?.user?.sessionId;

  if (!userId || !sessionId) throw new AppError("NAO_AUTENTICADO");

  const record = await prisma.session.findFirst({
    where: { id: sessionId, userId },
    select: {
      id: true,
      revokedAt: true,
      expiresAt: true,
      lastSeenAt: true,
      // passwordHash jamais sai do banco para a aplicação
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          company: true,
          currency: true,
          timezone: true,
        },
      },
    },
  });

  const now = new Date();

  // Sessão inexistente, revogada (logout, "encerrar outras sessões") ou vencida.
  if (!record || record.revokedAt || record.expiresAt <= now) {
    throw new AppError("NAO_AUTENTICADO");
  }

  if (now.getTime() - record.lastSeenAt.getTime() > IDLE_LIMIT_MS) {
    await closeSession(record.id);
    throw new AppError("NAO_AUTENTICADO");
  }

  if (now.getTime() - record.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await prisma.session.updateMany({ where: { id: record.id }, data: { lastSeenAt: now } });
  }

  return { ...record.user, sessionId };
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
