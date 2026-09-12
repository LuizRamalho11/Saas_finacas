/**
 * Sobe um PostgreSQL local de verdade, sem Docker e sem instalação no sistema.
 * Os binários vêm do pacote `embedded-postgres` e os dados ficam em .postgres/.
 *
 *   node scripts/db-local.mjs start   # inicia e mantém rodando
 *   node scripts/db-local.mjs init    # inicia, cria o banco e encerra
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.resolve(".postgres");
const PORT = 55432;
const USER = "finora";
const PASSWORD = "finora";
const DATABASE = "finora";

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
});

const command = process.argv[2] ?? "start";
const fresh = !fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));

if (fresh) {
  console.log("Inicializando cluster PostgreSQL em .postgres/ …");
  await pg.initialise();
}

await pg.start();
console.log(`PostgreSQL ouvindo em postgresql://${USER}:${PASSWORD}@localhost:${PORT}`);

try {
  await pg.createDatabase(DATABASE);
  console.log(`Banco "${DATABASE}" criado.`);
} catch {
  console.log(`Banco "${DATABASE}" já existe.`);
}

if (command === "init") {
  await pg.stop();
  console.log("Cluster encerrado (init concluído).");
  process.exit(0);
}

const shutdown = async () => {
  console.log("\nEncerrando PostgreSQL…");
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
