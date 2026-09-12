import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./tests/setup/test-database.mts";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

// Descartável, sorteado a cada execução: os testes não verificam assinatura
// de sessão, e assim nenhum literal com cara de segredo entra no repositório.
const TEST_AUTH_SECRET = randomBytes(32).toString("base64");

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: rootDir },
      // Fora do Next, `server-only` lança sempre; nos testes vira um módulo vazio.
      { find: /^server-only$/, replacement: path.join(rootDir, "tests/stubs/server-only.ts") },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["./tests/setup/global-db.ts"],
          setupFiles: ["./tests/setup/integration.ts"],
          // Um banco só: os arquivos rodam em série para não truncar tabelas
          // debaixo do teste vizinho.
          fileParallelism: false,
          testTimeout: 20_000,
          env: {
            DATABASE_URL: TEST_DATABASE_URL,
            AUTH_SECRET: TEST_AUTH_SECRET,
            AUTH_TRUST_HOST: "true",
          },
        },
      },
    ],
  },
});
