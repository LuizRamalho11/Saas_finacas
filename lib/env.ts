import { z } from "zod";

/**
 * Única porta de entrada para variáveis de ambiente.
 *
 * Regra do projeto: nenhum outro arquivo da aplicação lê `process.env`. Assim
 * uma variável faltando ou malformada derruba o servidor na partida, com uma
 * mensagem clara, em vez de virar `undefined` no meio de uma requisição.
 *
 * As mensagens de erro citam só o nome da variável — nunca o valor — para que
 * um segredo não vaze em log de build ou de produção.
 */

const booleanFromEnv = z
  .enum(["true", "false"], { error: 'Use exatamente "true" ou "false".' })
  .default("false")
  .transform((value) => value === "true");

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Conexão do PostgreSQL usada pelo Prisma. */
  DATABASE_URL: z
    .string({ error: "Não definida. Copie .env.example para .env e preencha." })
    .min(1, "Defina a conexão do PostgreSQL. Copie .env.example para .env.")
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "Precisa ser uma URL PostgreSQL (postgresql://…).",
    ),

  /** Segredo de assinatura das sessões. Gere com: openssl rand -base64 32 */
  AUTH_SECRET: z
    .string({ error: "Não definido. Gere com: openssl rand -base64 32" })
    .min(32, "Precisa ter ao menos 32 caracteres. Gere com: openssl rand -base64 32"),

  /** Confiar no cabeçalho Host da requisição (necessário atrás de proxy). */
  AUTH_TRUST_HOST: booleanFromEnv,

  /** URL pública da aplicação, usada em redirecionamentos e e-mails. */
  APP_URL: z.url({ error: "Informe uma URL completa (https://…)." }).default("http://localhost:3000"),
});

/**
 * Variáveis expostas ao navegador. O Next injeta o valor no bundle durante o
 * build, então nada de segredo aqui: só o que pode ser lido por qualquer um.
 * Hoje não existe nenhuma; quando existir, declare `NEXT_PUBLIC_*` abaixo e
 * leia sempre por `clientEnv`.
 */
const clientSchema = z.object({});

function parseOrFail<T extends z.ZodType>(schema: T, source: unknown, scope: string): z.infer<T> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
    .join("\n");

  throw new Error(`Variáveis de ambiente inválidas (${scope}):\n${details}`);
}

export const env = parseOrFail(serverSchema, process.env, "servidor");

// `next build` roda com NODE_ENV=production, inclusive na máquina do
// desenvolvedor, então isto é aviso e não erro: quebrar aqui impediria um build
// local legítimo. Em produção de verdade, APP_URL precisa ser a URL pública.
if (env.NODE_ENV === "production" && env.APP_URL.includes("localhost")) {
  console.warn(
    "[env] APP_URL ainda aponta para localhost. Defina a URL pública antes de publicar — redirecionamentos e e-mails vão sair errados.",
  );
}

export const clientEnv = parseOrFail(clientSchema, {}, "cliente");

export type Env = typeof env;
