import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Id da linha em `Session`, usado para fechar o histórico no logout. */
      sessionId?: string;
    } & DefaultSession["user"];
  }

  interface User {
    sessionId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    sessionId?: string;
  }
}
