import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { optionalUser, requireUser, type CurrentUser } from "@/lib/auth/guard";
import { AppError, appErrorFrom } from "@/lib/server/errors";
import { fieldErrorsFrom, type ActionResult } from "@/lib/validation";

/**
 * Camada única por onde passa tudo que é exportado de um arquivo `"use server"`
 * (ADR-010).
 *
 * Tudo que sai de um arquivo desses é um endpoint público: qualquer pessoa pode
 * chamar por POST, com qualquer argumento. O wrapper garante, em um lugar só:
 * sessão resolvida, parâmetros validados por Zod (com limite numérico), erro
 * conhecido virando mensagem em pt-BR e erro desconhecido virando log + mensagem
 * genérica, nunca o texto da exceção.
 *
 * - `defineAction` — mutações: devolve `ActionResult`, que os formulários já sabem ler.
 * - `defineQuery` — leituras: devolve o dado e lança `AppError` quando algo dá errado.
 * - `definePublicAction` — o que roda sem sessão (login, logout).
 *
 * Detalhe de TypeScript: declare `message` **depois** de `handler` no objeto de
 * configuração. É do handler que sai o tipo do dado, e o TypeScript infere na
 * ordem em que os campos aparecem.
 */

/** Marca as funções embrulhadas, para o teste que confere se ficou alguma de fora. */
export const WRAPPED = Symbol.for("finora.wrapped-server-function");

type Wrapped<TArgs extends unknown[], TResult> = ((...args: TArgs) => Promise<TResult>) & {
  [WRAPPED]: string;
};

interface CoreConfig<TInput, TOutput, TUser> {
  /** Nome curto, usado para correlacionar o erro no log. */
  name: string;
  /** Schema de TODOS os parâmetros. Sem schema, a função não aceita argumento. */
  input?: z.ZodType<TInput>;
  handler: (context: { input: TInput; user: TUser; requestId: string }) => Promise<TOutput>;
  /** Mensagem de sucesso mostrada pela interface (só nas mutações). */
  // NoInfer: a mensagem não deve participar da inferência do tipo de saída,
  // que sai do handler.
  message?: string | ((output: NoInfer<TOutput>) => string);
}

function parseInput<TInput>(schema: z.ZodType<TInput> | undefined, raw: unknown): TInput {
  if (!schema) return undefined as TInput;

  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;

  throw new AppError("DADOS_INVALIDOS", { fieldErrors: fieldErrorsFrom(parsed.error) });
}

/**
 * Log de erro inesperado. Fica no servidor e carrega o `requestId` que o usuário
 * vê junto da mensagem genérica, para dar para casar um com o outro no suporte.
 */
function logUnexpected(name: string, requestId: string, error: AppError) {
  console.error(`[action:${name}] falha inesperada (requestId ${requestId})`, error.cause ?? error);
}

function successMessage<TOutput>(
  message: string | ((output: TOutput) => string) | undefined,
  output: TOutput,
): string | undefined {
  return typeof message === "function" ? message(output) : message;
}

function mark<TArgs extends unknown[], TResult>(
  name: string,
  fn: (...args: TArgs) => Promise<TResult>,
): Wrapped<TArgs, TResult> {
  return Object.assign(fn, { [WRAPPED]: name });
}

/** Mutação autenticada. Nunca lança: o erro vira `ActionResult`. */
export function defineAction<TInput, TOutput>(config: CoreConfig<TInput, TOutput, CurrentUser>) {
  return mark(config.name, async (raw?: unknown): Promise<ActionResult<TOutput>> => {
    const requestId = crypto.randomUUID().slice(0, 8);
    try {
      const user = await requireUser();
      const input = parseInput(config.input, raw);
      const data = await config.handler({ input, user, requestId });
      return { ok: true, data, message: successMessage(config.message, data) };
    } catch (error) {
      // `redirect()` e `notFound()` sinalizam por exceção: são controle de fluxo
      // do Next, não falha, e precisam passar direto.
      unstable_rethrow(error);
      const appError = appErrorFrom(error);
      if (appError.code === "FALHA_INTERNA") logUnexpected(config.name, requestId, appError);
      return { ok: false, error: appError.message, fieldErrors: appError.fieldErrors };
    }
  });
}

/** Mutação que roda sem sessão (login, logout). O usuário pode não existir. */
export function definePublicAction<TInput, TOutput>(config: CoreConfig<TInput, TOutput, CurrentUser | null>) {
  return mark(config.name, async (raw?: unknown): Promise<ActionResult<TOutput>> => {
    const requestId = crypto.randomUUID().slice(0, 8);
    try {
      const user = await optionalUser();
      const input = parseInput(config.input, raw);
      const data = await config.handler({ input, user, requestId });
      return { ok: true, data, message: successMessage(config.message, data) };
    } catch (error) {
      // `redirect()` e `notFound()` sinalizam por exceção: são controle de fluxo
      // do Next, não falha, e precisam passar direto.
      unstable_rethrow(error);
      const appError = appErrorFrom(error);
      if (appError.code === "FALHA_INTERNA") logUnexpected(config.name, requestId, appError);
      return { ok: false, error: appError.message, fieldErrors: appError.fieldErrors };
    }
  });
}

/**
 * Leitura autenticada. Devolve o dado direto, porque as telas consomem valores
 * (e não `ActionResult`); parâmetro fora do limite lança `AppError`, que a
 * fronteira da UI trata como falha de carregamento.
 */
export function defineQuery<TInput, TOutput>(config: CoreConfig<TInput, TOutput, CurrentUser>) {
  return mark(config.name, async (raw?: unknown): Promise<TOutput> => {
    const requestId = crypto.randomUUID().slice(0, 8);
    try {
      const user = await requireUser();
      const input = parseInput(config.input, raw);
      return await config.handler({ input, user, requestId });
    } catch (error) {
      // `redirect()` e `notFound()` sinalizam por exceção: são controle de fluxo
      // do Next, não falha, e precisam passar direto.
      unstable_rethrow(error);
      const appError = appErrorFrom(error);
      if (appError.code === "FALHA_INTERNA") logUnexpected(config.name, requestId, appError);
      throw appError;
    }
  });
}
