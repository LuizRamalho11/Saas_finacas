/**
 * Servidor usado pelos testes de ponta a ponta.
 *
 * Sobe um PostgreSQL só para o E2E (porta 55434), aplica as migrations, recria
 * o usuário de teste e então inicia o Next numa porta e num diretório de build
 * próprios — assim a suíte pode rodar com o seu `npm run dev` aberto.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";

const PORT = 3100;
const DB_PORT = 55434;
const DATA_DIR = path.resolve(".postgres-e2e");
const DATABASE_URL = `postgresql://finora:finora@localhost:${DB_PORT}/finora_e2e?schema=public`;

const env = {
  ...process.env,
  DATABASE_URL,
  // Sorteado a cada execução: nenhum segredo literal versionado.
  AUTH_SECRET: randomBytes(32).toString("base64"),
  AUTH_TRUST_HOST: "true",
  APP_URL: `http://localhost:${PORT}`,
  NEXT_DIST_DIR: ".next-e2e",
};

const postgres = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "finora",
  password: "finora",
  port: DB_PORT,
  persistent: true,
});

if (!fs.existsSync(path.join(DATA_DIR, "PG_VERSION"))) await postgres.initialise();
await postgres.start();
try {
  await postgres.createDatabase("finora_e2e");
} catch {
  // Já existe: caso normal a partir da segunda execução.
}

execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "inherit" });
execFileSync("npx", ["tsx", "scripts/e2e-seed.ts"], { env, stdio: "inherit" });

const next = spawn("npx", ["next", "dev", "-p", String(PORT)], { env, stdio: "inherit" });

const shutdown = async () => {
  next.kill("SIGTERM");
  await postgres.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
next.on("exit", shutdown);
