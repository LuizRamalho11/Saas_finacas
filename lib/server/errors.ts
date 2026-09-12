import { Prisma } from "@prisma/client";

/**
 * Erros de negócio com código estável e mensagem em pt-BR.
 *
 * A regra é: o usuário recebe a mensagem, o log recebe o detalhe. Nada de
 * devolver `error.message` de uma exceção desconhecida para o cliente — é assim
 * que nome de tabela, caminho de arquivo e versão de biblioteca vazam.
 */
export type AppErrorCode =
  | "NAO_AUTENTICADO"
  | "SEM_PERMISSAO"
  | "DADOS_INVALIDOS"
  | "NAO_ENCONTRADO"
  | "CONFLITO"
  | "LIMITE_EXCEDIDO"
  | "FALHA_INTERNA";

const DEFAULT_MESSAGE: Record<AppErrorCode, string> = {
  NAO_AUTENTICADO: "Sua sessão expirou. Entre novamente para continuar.",
  SEM_PERMISSAO: "Você não tem permissão para esta ação.",
  DADOS_INVALIDOS: "Revise os campos destacados.",
  NAO_ENCONTRADO: "Registro não encontrado.",
  CONFLITO: "Já existe um registro com esses dados.",
  LIMITE_EXCEDIDO: "Muitas tentativas. Tente novamente em alguns minutos.",
  FALHA_INTERNA: "Não foi possível concluir a operação. Tente novamente.",
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    code: AppErrorCode,
    options: { message?: string; fieldErrors?: Record<string, string>; cause?: unknown } = {},
  ) {
    super(options.message ?? DEFAULT_MESSAGE[code], { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = options.fieldErrors;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Traduz qualquer erro para um `AppError`. O que não for reconhecido vira
 * `FALHA_INTERNA`, com o erro original preservado em `cause` para o log.
 */
export function appErrorFrom(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new AppError("CONFLITO", { message: "Já existe um registro com esse nome.", cause: error });
    }
    if (error.code === "P2003") {
      return new AppError("DADOS_INVALIDOS", {
        message: "Categoria ou conta inválida para este usuário.",
        cause: error,
      });
    }
    if (error.code === "P2025") {
      return new AppError("NAO_ENCONTRADO", { cause: error });
    }
  }

  return new AppError("FALHA_INTERNA", { cause: error });
}
