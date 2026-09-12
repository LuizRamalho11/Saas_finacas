import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "@/lib/server/rate-limit";

const REGRA = { limit: 3, windowMs: 60_000 };

describe("limitador em memória", () => {
  it("libera até o limite e barra a partir dele", async () => {
    const limiter = createMemoryRateLimiter();

    expect((await limiter.hit("chave", REGRA)).ok).toBe(true);
    expect((await limiter.hit("chave", REGRA)).ok).toBe(true);
    expect((await limiter.hit("chave", REGRA)).ok).toBe(true);
    expect((await limiter.hit("chave", REGRA)).ok).toBe(false);
  });

  it("conta cada chave separadamente", async () => {
    const limiter = createMemoryRateLimiter();

    for (let i = 0; i < 3; i += 1) await limiter.hit("a", REGRA);

    expect((await limiter.hit("a", REGRA)).ok).toBe(false);
    expect((await limiter.hit("b", REGRA)).ok).toBe(true);
  });

  it("peek informa sem gastar tentativa", async () => {
    const limiter = createMemoryRateLimiter();
    await limiter.hit("chave", REGRA);

    expect((await limiter.peek("chave", REGRA)).remaining).toBe(2);
    expect((await limiter.peek("chave", REGRA)).remaining).toBe(2);
    expect((await limiter.hit("chave", REGRA)).remaining).toBe(1);
  });

  it("reset devolve todas as tentativas", async () => {
    const limiter = createMemoryRateLimiter();
    for (let i = 0; i < 3; i += 1) await limiter.hit("chave", REGRA);

    await limiter.reset("chave");

    expect((await limiter.hit("chave", REGRA)).ok).toBe(true);
  });

  it("a janela vencida recomeça a contagem", async () => {
    const limiter = createMemoryRateLimiter();
    const janelaCurta = { limit: 1, windowMs: 20 };

    expect((await limiter.hit("chave", janelaCurta)).ok).toBe(true);
    expect((await limiter.hit("chave", janelaCurta)).ok).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect((await limiter.hit("chave", janelaCurta)).ok).toBe(true);
  });

  it("informa em quantos segundos tentar de novo", async () => {
    const limiter = createMemoryRateLimiter();
    const result = await limiter.hit("chave", REGRA);

    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});

describe("teto de chaves (evita virar vetor de DoS de memória)", () => {
  it("descarta janelas vencidas em vez de acumular", async () => {
    const limiter = createMemoryRateLimiter({ maxKeys: 3 });
    const janelaCurta = { limit: 5, windowMs: 10 };

    for (let i = 0; i < 3; i += 1) await limiter.hit(`vencida-${i}`, janelaCurta);
    await new Promise((resolve) => setTimeout(resolve, 20));

    await limiter.hit("nova", janelaCurta);

    expect(limiter.size?.()).toBe(1);
  });

  it("não passa do teto nem com chaves novas em rajada", async () => {
    const limiter = createMemoryRateLimiter({ maxKeys: 5 });

    for (let i = 0; i < 100; i += 1) {
      await limiter.hit(`atacante-${i}@exemplo.test`, REGRA);
    }

    expect(limiter.size?.()).toBeLessThanOrEqual(5);
  });

  it("continua contando certo depois da poda", async () => {
    const limiter = createMemoryRateLimiter({ maxKeys: 5 });

    for (let i = 0; i < 50; i += 1) await limiter.hit(`ruido-${i}`, REGRA);

    for (let i = 0; i < 3; i += 1) await limiter.hit("chave-real", REGRA);
    expect((await limiter.hit("chave-real", REGRA)).ok).toBe(false);
  });
});
