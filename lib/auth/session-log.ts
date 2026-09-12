import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/** Extrai IP e user-agent da requisição corrente, tolerando ambientes sem proxy. */
export async function requestFingerprint() {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const ipAddress =
      forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || headerList.get("cf-connecting-ip") || null;
    return { ipAddress, userAgent: headerList.get("user-agent") };
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
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

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

/** Fecha a sessão e carimba `logoutAt` no histórico. Idempotente. */
export async function closeSession(sessionId: string | undefined | null) {
  if (!sessionId) return;
  const now = new Date();

  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: now },
  });

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
