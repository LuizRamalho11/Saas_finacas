import path from "node:path";

/**
 * Cluster próprio dos testes, separado do banco de desenvolvimento (55432):
 * rodar a suíte nunca mexe nos dados do seu `npm run dev`.
 *
 * Importado tanto pelo vitest.config.mts quanto pelo global setup, que precisa
 * de porta, usuário e nome do banco para subir o PostgreSQL.
 */
export const TEST_DB = {
  port: 55433,
  user: "finora",
  password: "finora",
  database: "finora_test",
  dataDir: path.resolve(".postgres-test"),
};

export const TEST_DATABASE_URL = `postgresql://${TEST_DB.user}:${TEST_DB.password}@localhost:${TEST_DB.port}/${TEST_DB.database}?schema=public`;
