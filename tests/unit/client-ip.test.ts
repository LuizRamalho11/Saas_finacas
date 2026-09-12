import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * F17: o IP saía do primeiro valor de `X-Forwarded-For`, que é escrito pelo
 * cliente. Dava para inventar o IP do histórico de acesso e, pior, ganhar um
 * balde novo de rate limit a cada tentativa.
 */
const BASE_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://finora:finora@localhost:55432/finora",
  AUTH_SECRET: "s".repeat(32),
};

async function clientIpCom(trustedProxy: string, cabecalhos: Record<string, string>) {
  vi.resetModules();
  for (const [chave, valor] of Object.entries({ ...BASE_ENV, TRUSTED_PROXY: trustedProxy })) {
    vi.stubEnv(chave, valor);
  }
  vi.doMock("next/headers", () => ({ headers: async () => new Headers(cabecalhos) }));

  const { clientIp } = await import("@/lib/server/client-ip");
  return clientIp();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("next/headers");
  vi.resetModules();
});

describe("clientIp", () => {
  it("sem proxy declarado, ignora cabeçalho forjado", async () => {
    const ip = await clientIpCom("none", {
      "x-forwarded-for": "1.2.3.4, 10.0.0.1",
      "x-real-ip": "1.2.3.4",
    });

    expect(ip).toBeNull();
  });

  it("na Vercel, usa o cabeçalho que o cliente não controla", async () => {
    const ip = await clientIpCom("vercel", {
      "x-forwarded-for": "1.2.3.4",
      "x-vercel-forwarded-for": "198.51.100.7",
      "x-real-ip": "198.51.100.7",
    });

    expect(ip).toBe("198.51.100.7");
  });

  it("na Vercel, cai para x-real-ip quando o específico não vem", async () => {
    expect(await clientIpCom("vercel", { "x-real-ip": "198.51.100.8" })).toBe("198.51.100.8");
  });

  it("atrás de proxy próprio, usa o último salto e não o primeiro", async () => {
    const ip = await clientIpCom("last-hop", {
      // O primeiro valor é o que o atacante digitou; o último foi escrito pelo proxy.
      "x-forwarded-for": "1.2.3.4, 203.0.113.9",
    });

    expect(ip).toBe("203.0.113.9");
  });

  it("fora de uma requisição, devolve null em vez de quebrar", async () => {
    vi.resetModules();
    for (const [chave, valor] of Object.entries({ ...BASE_ENV, TRUSTED_PROXY: "vercel" })) {
      vi.stubEnv(chave, valor);
    }
    vi.doMock("next/headers", () => ({
      headers: async () => {
        throw new Error("fora do escopo de uma requisição");
      },
    }));

    const { clientIp } = await import("@/lib/server/client-ip");
    expect(await clientIp()).toBeNull();
  });
});
