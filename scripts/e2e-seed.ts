/**
 * Prepara o banco de E2E: limpa tudo e recria o usuário de teste com uma conta
 * e uma categoria, para as telas terem o mínimo com que trabalhar.
 */
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { E2E_USER } from "../e2e/support/user";

async function main() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Transaction", "Category", "Account", "Session", "LoginHistory", "User" RESTART IDENTITY CASCADE',
  );

  const user = await prisma.user.create({
    data: {
      name: E2E_USER.name,
      email: E2E_USER.email,
      passwordHash: await bcrypt.hash(E2E_USER.password, 8),
    },
  });

  await prisma.account.create({ data: { userId: user.id, name: "Conta corrente", type: "checking" } });
  await prisma.category.create({ data: { userId: user.id, name: "Serviços", type: "expense" } });

  console.log(`Banco de E2E pronto para ${user.email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
