import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/lib/env";

/**
 * Cliente Prisma único por processo. Em desenvolvimento o Next recarrega os
 * módulos a cada alteração; sem o cache global abriríamos um pool novo a cada
 * hot reload até estourar o limite de conexões do Postgres.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  // A conexão já foi validada em lib/env.ts, na partida do servidor.
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
