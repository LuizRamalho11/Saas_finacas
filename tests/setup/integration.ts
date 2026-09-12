import { afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * Preparo comum dos testes de integração.
 *
 * - Troca o Auth.js por uma sessão que o teste controla (`signInAs`), para
 *   exercitar `requireUser()` de verdade, com o banco de verdade.
 * - Neutraliza `revalidatePath`, que só existe dentro de uma requisição do Next.
 * - Zera as tabelas antes de cada teste.
 */
const session = vi.hoisted(() => ({
  value: null as { user: { id: string; email: string; sessionId?: string } } | null,
}));

vi.mock("@/auth", () => ({
  auth: async () => session.value,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

export function signInAs(user: { id: string; email: string; sessionId?: string }) {
  session.value = { user };
}

export function signOutEveryone() {
  session.value = null;
}

const TABLES = ['"Transaction"', '"Category"', '"Account"', '"Session"', '"LoginHistory"', '"User"'];

beforeEach(async () => {
  signOutEveryone();
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
