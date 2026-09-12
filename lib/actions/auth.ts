"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guard";
import { closeSession, expireStaleSessions } from "@/lib/auth/session-log";
import { profileSchema, fieldErrorsFrom, type ActionResult } from "@/lib/validation";
import type { LoginRecord } from "@/types";

const loginSchema = z.object({
  email: z.email({ error: "Informe um e-mail válido." }),
  password: z.string().min(6, "A senha precisa ter ao menos 6 caracteres."),
});

export async function loginAction(input: {
  email: string;
  password: string;
  redirectTo?: string;
}): Promise<ActionResult<undefined>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // A tentativa já foi registrada em LoginHistory dentro do authorize().
      return { ok: false, error: "E-mail ou senha incorretos." };
    }
    throw error;
  }

  return { ok: true, data: undefined };
}

/** Encerra a sessão marcando `logoutAt` no histórico antes de limpar o cookie. */
export async function logoutAction() {
  try {
    const user = await requireUser();
    await closeSession(user.sessionId);
  } catch {
    // Sessão já inválida: seguimos para limpar o cookie de qualquer forma.
  }
  await signOut({ redirect: false });
  redirect("/login");
}

export async function getLoginHistory(limit = 20): Promise<LoginRecord[]> {
  const user = await requireUser();

  // Aproveita a visita para fechar sessões que venceram sem logout explícito.
  await expireStaleSessions(user.id);

  const rows = await prisma.loginHistory.findMany({
    where: { userId: user.id },
    orderBy: { loginAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    loginAt: row.loginAt.toISOString(),
    logoutAt: row.logoutAt?.toISOString() ?? null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    success: row.success,
    reason: row.reason,
    current: Boolean(user.sessionId && row.sessionId === user.sessionId && !row.logoutAt),
  }));
}

/** Revoga todas as outras sessões ativas do usuário. */
export async function revokeOtherSessions(): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requireUser();
    const now = new Date();

    const others = await prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, ...(user.sessionId ? { id: { not: user.sessionId } } : {}) },
      select: { id: true },
    });

    if (!others.length) return { ok: true, data: { count: 0 }, message: "Nenhuma outra sessão ativa." };

    const ids = others.map((session) => session.id);
    await prisma.session.updateMany({ where: { id: { in: ids } }, data: { revokedAt: now } });
    await prisma.loginHistory.updateMany({
      where: { sessionId: { in: ids }, logoutAt: null },
      data: { logoutAt: now },
    });

    return { ok: true, data: { count: ids.length }, message: `${ids.length} sessão(ões) encerrada(s).` };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Não foi possível encerrar as outras sessões." };
  }
}

export async function updateProfile(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const user = await requireUser();
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error) };
    }

    const email = parsed.data.email.toLowerCase();
    if (email !== user.email) {
      const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (taken) {
        return { ok: false, error: "E-mail já utilizado.", fieldErrors: { email: "E-mail já utilizado." } };
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name,
        role: parsed.data.role || undefined,
        email,
        timezone: parsed.data.timezone || undefined,
        currency: parsed.data.currency,
      },
    });

    return { ok: true, data: undefined, message: "Preferências salvas." };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Não foi possível salvar as alterações." };
  }
}
