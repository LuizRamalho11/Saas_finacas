import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/server/client-ip";

/**
 * IP e user-agent da requisição corrente.
 *
 * O IP vem de `clientIp()`, que só aceita cabeçalho de proxy declarado no
 * ambiente — antes bastava mandar um `X-Forwarded-For` qualquer para sujar o
 * histórico de acesso com um IP inventado (F17).
 */
export async function requestFingerprint() {
  try {
    const headerList = await headers();
    return { ipAddress: await clientIp(), userAgent: headerList.get("user-agent") };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

/** Registra uma tentativa de login malsucedida — inclusive de e-mail inexistente. */
export async function recordFailedLogin(email: string, reason: string, userId?: string) {
  const { ipAddress, userAgent } = await requestFingerprint();
  await prisma.loginHistory.create({
    data: { userId: userId ?? null, email, success: false, reason, ipAddress, userAgent },
  });
}

/**
 * Cria a sessão da aplicação e o registro de histórico correspondente.
 * O token JWT do Auth.js carrega o `sessionId` devolvido aqui, o que permite
 * fechar o histórico no logout.
 */
export async function openSession(userId: string, email: string) {
  const { ipAddress, userAgent } = await requestFingerprint();
  // Mesma validade do cookie (auth.ts): 7 dias.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId,
      sessionToken: crypto.randomUUID(),
      expiresAt,
    },
  });

  await prisma.loginHistory.create({
    data: { userId, sessionId: session.id, email, success: true, ipAddress, userAgent },
  });

  return session.id;
}

/**
 * Fecha a sessão e carimba `logoutAt` no histórico. Idempotente.
 *
 * `userId` entra no filtro como defesa em profundidade: hoje todos os chamadores
 * passam uma sessão já conferida, mas se um dia um id vier do cliente, revogar a
 * sessão de outra pessoa continua impossível.
 */
export async function closeSession(sessionId: string | undefined | null, userId?: string) {
  if (!sessionId) return;
  const now = new Date();

  const revogadas = await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null, ...(userId ? { userId } : {}) },
    data: { revokedAt: now },
  });

  if (revogadas.count === 0) return;

  await prisma.loginHistory.updateMany({
    where: { sessionId, logoutAt: null },
    data: { logoutAt: now },
  });
}

/** Marca como encerradas as sessões que passaram da validade. */
export async function expireStaleSessions(userId: string) {
  const now = new Date();
  const stale = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { lt: now } },
    select: { id: true },
  });
  if (!stale.length) return;

  const ids = stale.map((session) => session.id);
  await prisma.session.updateMany({ where: { id: { in: ids } }, data: { revokedAt: now } });
  await prisma.loginHistory.updateMany({
    where: { sessionId: { in: ids }, logoutAt: null },
    data: { logoutAt: now },
  });
}
