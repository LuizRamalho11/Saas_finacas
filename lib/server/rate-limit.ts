import "server-only";
import { env } from "@/lib/env";

/**
 * Limitador de tentativas (ADR-005).
 *
 * Em produção usa o Upstash Redis pela API REST, para valer entre instâncias;
 * sem as variáveis do Upstash, cai para memória — suficiente em desenvolvimento
 * e nos testes, inútil num servidor com réplicas.
 *
 * A API REST é chamada com `fetch` direto: uma dependência a menos no bundle
 * para um contrato de duas chamadas (regra 10 do projeto).
 */
export interface RateLimitRule {
  /** Quantas tentativas cabem na janela. */
  limit: number;
  /** Tamanho da janela, em milissegundos. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Conta mais uma tentativa para a chave e diz se ela ainda cabe na janela. */
  hit(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
  /** Lê a situação da chave sem gastar uma tentativa. */
  peek(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
  /** Zera a contagem (login bem-sucedido, por exemplo). */
  reset(key: string): Promise<void>;
}

function resultFrom(count: number, rule: RateLimitRule, resetAt: number): RateLimitResult {
  const remaining = Math.max(0, rule.limit - count);
  return {
    ok: count <= rule.limit,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
  };
}

/** Contagem por processo. Some no restart e não enxerga outras instâncias. */
export function createMemoryRateLimiter(): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    async hit(key, rule) {
      const now = Date.now();
      const current = buckets.get(key);

      if (!current || current.resetAt <= now) {
        const fresh = { count: 1, resetAt: now + rule.windowMs };
        buckets.set(key, fresh);
        return resultFrom(fresh.count, rule, fresh.resetAt);
      }

      current.count += 1;
      return resultFrom(current.count, rule, current.resetAt);
    },

    async peek(key, rule) {
      const current = buckets.get(key);
      if (!current || current.resetAt <= Date.now()) return resultFrom(0, rule, Date.now());
      return resultFrom(current.count, rule, current.resetAt);
    },

    async reset(key) {
      buckets.delete(key);
    },
  };
}

/** Upstash pela API REST: INCR na chave e EXPIRE na primeira tentativa da janela. */
export function createUpstashRateLimiter(url: string, token: string): RateLimiter {
  async function command(parts: string[]): Promise<unknown> {
    const response = await fetch(`${url}/${parts.map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Upstash respondeu ${response.status}`);
    const body = (await response.json()) as { result?: unknown };
    return body.result;
  }

  return {
    async hit(key, rule) {
      const windowSeconds = Math.ceil(rule.windowMs / 1000);
      const count = Number(await command(["incr", key]));

      if (count === 1) await command(["expire", key, String(windowSeconds)]);

      const ttl = Number(await command(["ttl", key]));
      const resetAt = Date.now() + Math.max(1, ttl) * 1000;
      return resultFrom(count, rule, resetAt);
    },

    async peek(key, rule) {
      const count = Number((await command(["get", key])) ?? 0);
      const ttl = Number(await command(["ttl", key]));
      return resultFrom(count, rule, Date.now() + Math.max(0, ttl) * 1000);
    },

    async reset(key) {
      await command(["del", key]);
    },
  };
}

let limiter: RateLimiter | null = null;

export function rateLimiter(): RateLimiter {
  if (limiter) return limiter;

  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    limiter = createUpstashRateLimiter(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  } else {
    if (env.NODE_ENV === "production") {
      console.warn(
        "[rate-limit] Sem Upstash configurado: o limite passa a valer por instância, em memória. Defina UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN.",
      );
    }
    limiter = createMemoryRateLimiter();
  }

  return limiter;
}

/** Só para os testes: descarta o limitador memorizado entre cenários. */
export function resetRateLimiterForTests() {
  limiter = null;
}
