-- Integridade de dados no banco (T1.8 — achados F14, F15 e F16).
--
-- Escrita à mão de propósito: o SQL que o Prisma gera para trocar texto por enum
-- faz DROP COLUMN + ADD COLUMN, o que apagaria o tipo e o status de todos os
-- lançamentos existentes. Com ALTER ... USING a conversão preserva os dados e o
-- Postgres reconstrói os índices sozinho.

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('income', 'expense');
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'completed', 'canceled');
CREATE TYPE "AccountType" AS ENUM ('checking', 'savings', 'credit_card', 'investment');

-- Account.type: texto -> enum
ALTER TABLE "Account"
  ALTER COLUMN "type" DROP DEFAULT,
  ALTER COLUMN "type" TYPE "AccountType" USING "type"::"AccountType",
  ALTER COLUMN "type" SET DEFAULT 'checking';

-- Category.type: texto -> enum
ALTER TABLE "Category"
  ALTER COLUMN "type" TYPE "TransactionType" USING "type"::"TransactionType";

-- Transaction: enums e precisão de dinheiro igual à de Account.openingBalance
ALTER TABLE "Transaction"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2),
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "type" TYPE "TransactionType" USING "type"::"TransactionType",
  ALTER COLUMN "status" TYPE "TransactionStatus" USING "status"::"TransactionStatus",
  ALTER COLUMN "status" SET DEFAULT 'completed';

-- O sinal do lançamento vem do tipo (entrada/saída); o valor é sempre positivo.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_amount_positivo" CHECK ("amount" > 0);

-- F14: apagar uma conta não pode levar junto o histórico financeiro.
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_accountId_fkey";
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
