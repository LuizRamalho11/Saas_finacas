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
      // O next-auth importa "next/server" sem extensão, que o resolvedor do Vite
      // não encontra pelo mapa de exports do Next.
      { find: /^next\/server$/, replacement: "next/server.js" },
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
          // O next-auth importa "next/server" sem extensão; processado pelo Vite,
          // o alias acima resolve. Externalizado, ele quebraria no loader do Node.
          server: { deps: { inline: [/next-auth/, /@auth\//] } },
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
