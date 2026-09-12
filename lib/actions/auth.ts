"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { closeSession, expireStaleSessions } from "@/lib/auth/session-log";
import { defineAction, definePublicAction, defineQuery } from "@/lib/server/action";
import { AppError } from "@/lib/server/errors";
import { limitSchema } from "@/lib/server/schemas";
import { profileSchema } from "@/lib/validation";
import type { LoginRecord } from "@/types";

const loginSchema = z.object({
  email: z.email({ error: "Informe um e-mail válido." }),
  password: z.string().min(6, "A senha precisa ter ao menos 6 caracteres."),
  redirectTo: z.string().max(200).optional(),
});

export const loginAction = definePublicAction({
  name: "loginAction",
  input: loginSchema,
  async handler({ input }) {
    try {
      await signIn("credentials", {
        email: input.email,
        password: input.password,
        redirect: false,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        // A tentativa já foi registrada em LoginHistory dentro do authorize().
        // A mensagem é a mesma para e-mail inexistente e senha errada, de propósito.
        throw new AppError("NAO_AUTENTICADO", { message: "E-mail ou senha incorretos.", cause: error });
      }
      throw error;
    }

    return undefined;
  },
});

/** Encerra a sessão marcando `logoutAt` no histórico antes de limpar o cookie. */
export const logoutAction = definePublicAction({
  name: "logoutAction",
  async handler({ user }) {
    if (user?.sessionId) {
      await closeSession(user.sessionId);
    }
    await signOut({ redirect: false });
    // O wrapper deixa passar o sinal de redirecionamento do Next.
    redirect("/login");
  },
});

export const getLoginHistory = defineQuery({
  name: "getLoginHistory",
  input: limitSchema.default(20),
  async handler({ input: limit, user }): Promise<LoginRecord[]> {
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
  },
});

/** Revoga todas as outras sessões ativas do usuário. */
export const revokeOtherSessions = defineAction({
  name: "revokeOtherSessions",
  async handler({ user }) {
    const now = new Date();

    const others = await prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, ...(user.sessionId ? { id: { not: user.sessionId } } : {}) },
      select: { id: true },
    });

    if (!others.length) return { count: 0 };

    const ids = others.map((session) => session.id);
    await prisma.session.updateMany({ where: { id: { in: ids } }, data: { revokedAt: now } });
    await prisma.loginHistory.updateMany({
      where: { sessionId: { in: ids }, logoutAt: null },
      data: { logoutAt: now },
    });

    return { count: ids.length };
  },
  message: ({ count }) => (count === 0 ? "Nenhuma outra sessão ativa." : `${count} sessão(ões) encerrada(s).`),
});

export const updateProfile = defineAction({
  name: "updateProfile",
  input: profileSchema,
  async handler({ input, user }) {
    const email = input.email.toLowerCase();
    if (email !== user.email) {
      const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (taken) {
        throw new AppError("CONFLITO", {
          message: "E-mail já utilizado.",
          fieldErrors: { email: "E-mail já utilizado." },
        });
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: input.name,
        role: input.role || undefined,
        email,
        timezone: input.timezone || undefined,
        currency: input.currency,
      },
    });

    return undefined;
  },
  message: "Preferências salvas.",
});
