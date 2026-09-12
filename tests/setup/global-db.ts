import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";
import { TEST_DB, TEST_DATABASE_URL } from "./test-database.mts";

/**
 * Sobe um PostgreSQL de verdade para os testes de integração — o mesmo
 * `embedded-postgres` do desenvolvimento, sem Docker (ADR-008).
 *
 * Roda uma vez por execução da suíte: inicia o cluster, garante o banco e
 * aplica as migrations. Nada de mock de banco: as regras de isolamento que
 * queremos provar dependem do Postgres de verdade.
 */
export default async function setup() {
  const postgres = new EmbeddedPostgres({
    databaseDir: TEST_DB.dataDir,
    user: TEST_DB.user,
    password: TEST_DB.password,
    port: TEST_DB.port,
    persistent: true,
  });

  const isFreshCluster = !fs.existsSync(path.join(TEST_DB.dataDir, "PG_VERSION"));
  if (isFreshCluster) await postgres.initialise();

  await postgres.start();

  try {
    await postgres.createDatabase(TEST_DB.database);
  } catch {
    // Banco já existe: é o caso normal a partir da segunda execução.
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });

  return async () => {
    // Um instante para o pool do Prisma fechar de verdade antes de derrubar o
    // cluster; sem isso o teardown imprime "Connection terminated" no fim de
    // uma execução que passou.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await postgres.stop();
  };
}
