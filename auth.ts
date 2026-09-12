import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { verifyCredentials, type CredentialFailure } from "@/lib/auth/credentials";
import { openSession, recordFailedLogin } from "@/lib/auth/session-log";
import { clientIp } from "@/lib/server/client-ip";
import { env } from "@/lib/env";

/** Motivo registrado no histórico de acesso. O usuário nunca vê este texto. */
const FAILURE_REASON: Record<CredentialFailure, string> = {
  credenciais_invalidas: "Senha incorreta",
  usuario_inexistente: "Usuário inexistente",
  bloqueado: "Conta bloqueada por tentativas seguidas",
  limite_excedido: "Limite de tentativas excedido",
};

const credentialsSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(6, "A senha precisa ter ao menos 6 caracteres."),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  // O provider de credenciais exige JWT: o Auth.js não grava sessão em banco
  // nesse fluxo. A tabela Session é mantida pela aplicação (lib/auth/session-log).
  // 7 dias, e não 30: o cookie é um JWT e só é derrubado no servidor porque
  // `requireUser()` confere a linha em `Session` (T1.2).
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
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

        // Rate limit, bloqueio progressivo e tempo constante moram aqui, e não
        // na Server Action: esta rota também é chamável direto (T1.4).
        const result = await verifyCredentials({
          email,
          password: parsed.data.password,
          ip: await clientIp(),
        });

        if (!result.ok) {
          await recordFailedLogin(email, FAILURE_REASON[result.reason], result.userId);
          return null;
        }

        const sessionId = await openSession(result.user.id, result.user.email);

        // Nunca devolvemos passwordHash: só o que o token precisa carregar.
        return { id: result.user.id, name: result.user.name, email: result.user.email, sessionId };
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
