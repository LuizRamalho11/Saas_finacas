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
  /** Quantas chaves estão vivas. Só o adaptador em memória sabe responder. */
  size?(): number;
}

function resultFrom(count: number, rule: RateLimitRule, resetAt: number): RateLimitResult {
  const remaining = Math.max(0, rule.limit - count);
  return {
    ok: count <= rule.limit,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
  };
}

/**
 * Teto de chaves vivas. Sem isso, uma rajada com milhões de e-mails distintos
 * encheria a memória do processo — o limitador viraria o próprio vetor de DoS.
 */
const MAX_KEYS = 20_000;

/** Contagem por processo. Some no restart e não enxerga outras instâncias. */
export function createMemoryRateLimiter(options: { maxKeys?: number } = {}): RateLimiter {
  const maxKeys = options.maxKeys ?? MAX_KEYS;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  /** Quantas chaves estão vivas agora. Só os testes usam. */
  function size() {
    return buckets.size;
  }

  /** Descarta janelas vencidas e, no limite, as que vencem primeiro. */
  function prune(now: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }

    if (buckets.size <= maxKeys) return;

    const porVencimento = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of porVencimento.slice(0, buckets.size - maxKeys)) {
      buckets.delete(key);
    }
  }

  return {
    async hit(key, rule) {
      const now = Date.now();
      const current = buckets.get(key);

      if (!current || current.resetAt <= now) {
        const fresh = { count: 1, resetAt: now + rule.windowMs };
        buckets.set(key, fresh);
        // Poda depois de inserir: a chave recém-criada é a mais nova e sobrevive.
        if (buckets.size > maxKeys) prune(now);
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

    size,
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

      let ttl = Number(await command(["ttl", key]));

      // -1 = chave sem expiração: acontece se um EXPIRE anterior falhou. Sem
      // este reparo a chave ficaria eterna e barraria o usuário para sempre.
      if (count === 1 || ttl < 0) {
        await command(["expire", key, String(windowSeconds)]);
        ttl = windowSeconds;
      }
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
