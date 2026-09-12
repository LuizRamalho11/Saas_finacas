import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `lib/env.ts` valida no momento do import, então cada caso reimporta o módulo
 * com um ambiente diferente.
 */
const VALID_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://finora:finora@localhost:55432/finora",
  AUTH_SECRET: "s".repeat(32),
  AUTH_TRUST_HOST: "true",
};

async function loadEnv(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...VALID_ENV, ...overrides })) {
    vi.stubEnv(key, value);
  }
  return import("@/lib/env");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("lib/env", () => {
  it("carrega o ambiente válido e aplica os padrões", async () => {
    const { env } = await loadEnv();
    expect(env.DATABASE_URL).toContain("postgresql://");
    expect(env.AUTH_TRUST_HOST).toBe(true);
    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  it("falha, citando a variável, quando DATABASE_URL não existe", async () => {
    await expect(loadEnv({ DATABASE_URL: undefined })).rejects.toThrow(/DATABASE_URL/);
  });

  it("recusa DATABASE_URL que não é PostgreSQL", async () => {
    await expect(loadEnv({ DATABASE_URL: "mysql://localhost/finora" })).rejects.toThrow(/PostgreSQL/);
  });

  it("recusa AUTH_SECRET curto e nunca mostra o valor na mensagem", async () => {
    const secret = "curto-demais";
    await expect(loadEnv({ AUTH_SECRET: secret })).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
    await expect(loadEnv({ AUTH_SECRET: secret })).rejects.toThrow(/AUTH_SECRET/);
  });

  it("recusa APP_URL que não é uma URL", async () => {
    await expect(loadEnv({ APP_URL: "nao-e-url" })).rejects.toThrow(/APP_URL/);
  });

  it("recusa AUTH_TRUST_HOST fora de true/false", async () => {
    await expect(loadEnv({ AUTH_TRUST_HOST: "sim" })).rejects.toThrow(/AUTH_TRUST_HOST/);
  });
});

describe("variável vazia é tratada como ausente", () => {
  it("DEMO_PASSWORD vazio não quebra a validação", async () => {
    const { env } = await loadEnv({ DEMO_PASSWORD: "" });
    expect(env.DEMO_PASSWORD).toBeUndefined();
  });

  it("credenciais do Upstash vazias caem para o limitador em memória", async () => {
    const { env } = await loadEnv({ UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" });
    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBeUndefined();
  });

  it("mas valor inválido de verdade continua reprovando", async () => {
    await expect(loadEnv({ DEMO_PASSWORD: "curta" })).rejects.toThrow(/DEMO_PASSWORD/);
    await expect(loadEnv({ UPSTASH_REDIS_REST_URL: "nao-e-url" })).rejects.toThrow(/UPSTASH_REDIS_REST_URL/);
  });
});
