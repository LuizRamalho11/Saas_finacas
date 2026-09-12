import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { openSession, recordFailedLogin } from "@/lib/auth/session-log";
import { env } from "@/lib/env";

const credentialsSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(6, "A senha precisa ter ao menos 6 caracteres."),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  // O provider de credenciais exige JWT: o Auth.js não grava sessão em banco
  // nesse fluxo. A tabela Session é mantida pela aplicação (lib/auth/session-log).
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  secret: env.AUTH_SECRET,
  // F18: vinha fixo como `true` no código; agora depende do ambiente.
  trustHost: env.AUTH_TRUST_HOST,
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
          await recordFailedLogin(email, "Usuário inexistente");
          return null;
        }

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) {
          await recordFailedLogin(email, "Senha incorreta", user.id);
          return null;
        }

        const sessionId = await openSession(user.id, user.email);

        // Nunca devolvemos passwordHash: só o que o token precisa carregar.
        return { id: user.id, name: user.name, email: user.email, sessionId };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.sessionId = (user as { sessionId?: string }).sessionId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.sessionId = token.sessionId as string | undefined;
      }
      return session;
    },
  },
});
