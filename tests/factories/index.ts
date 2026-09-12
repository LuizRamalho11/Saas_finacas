import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Cada chamada gera nomes e e-mails únicos, para não esbarrar nos índices. */
let sequence = 0;
const nextId = () => ++sequence;

export const TEST_PASSWORD = "senha-de-teste";

export async function createUser(overrides: Partial<Prisma.UserCreateInput> = {}) {
  const n = nextId();
  return prisma.user.create({
    data: {
      name: `Pessoa ${n}`,
      email: `pessoa${n}@finora.test`,
      // Custo baixo de propósito: os testes não medem a força do hash.
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
      ...overrides,
    },
  });
}

export async function createAccount(userId: string, overrides: Partial<Prisma.AccountCreateInput> = {}) {
  const n = nextId();
  return prisma.account.create({
    data: { name: `Conta ${n}`, type: "checking", user: { connect: { id: userId } }, ...overrides },
  });
}

export async function createCategory(
  userId: string,
  overrides: Partial<Prisma.CategoryCreateInput> & { type?: string } = {},
) {
  const n = nextId();
  return prisma.category.create({
    data: { name: `Categoria ${n}`, type: "expense", user: { connect: { id: userId } }, ...overrides },
  });
}

export async function createTransaction(
  params: {
    userId: string;
    accountId: string;
    categoryId: string;
  } & Partial<{
    description: string;
    amount: number;
    type: string;
    status: string;
    date: Date;
  }>,
) {
  const n = nextId();
  return prisma.transaction.create({
    data: {
      userId: params.userId,
      accountId: params.accountId,
      categoryId: params.categoryId,
      description: params.description ?? `Lançamento ${n}`,
      amount: new Prisma.Decimal((params.amount ?? 100).toFixed(2)),
      type: params.type ?? "expense",
      status: params.status ?? "completed",
      date: params.date ?? new Date("2026-06-15T12:00:00.000Z"),
    },
  });
}

/** Usuário já com conta e categoria de saída — o cenário mais comum nos testes. */
export async function createUserWithData() {
  const user = await createUser();
  const account = await createAccount(user.id);
  const category = await createCategory(user.id, { type: "expense" });
  return { user, account, category };
}
