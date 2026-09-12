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
