/**
 * Sanitiza destinos de redirecionamento vindos da URL (F02).
 *
 * `?redirectTo=` chega do navegador, então o valor é do atacante. Sem filtro,
 * `//site-malicioso.com` faz o login legítimo terminar fora do domínio — a
 * página de phishing ganha o contexto de quem acabou de digitar a senha.
 *
 * A regra é lista de permissão, não de bloqueio: só passa caminho relativo que
 * comece com uma única "/" e caia numa rota interna conhecida.
 *
 * Módulo puro de propósito: também roda no middleware, no runtime Edge.
 */
const ALLOWED_PREFIXES = ["/dashboard", "/transactions", "/cash-flow", "/reports", "/settings"];

const MAX_LENGTH = 512;

/** Espaço, tabulação, quebra de linha e controle servem para burlar filtro. */
function hasBlankOrControl(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Rejeita esquema (http:, javascript:), barra dupla e barra invertida. */
function looksHostile(value: string): boolean {
  if (!value.startsWith("/")) return true;
  if (value.startsWith("//")) return true;
  if (value.includes("\\")) return true;
  if (value.includes(":")) return true;
  return hasBlankOrControl(value);
}

export function safeRedirect(target: unknown, fallback = "/dashboard"): string {
  if (typeof target !== "string" || target.length === 0 || target.length > MAX_LENGTH) return fallback;

  let decoded: string;
  try {
    // `/%2F%2Fsite-malicioso.com` vira `///site-malicioso.com` depois que o
    // navegador decodifica: a checagem precisa valer para as duas formas.
    decoded = decodeURIComponent(target);
  } catch {
    return fallback;
  }

  if (looksHostile(target) || looksHostile(decoded)) return fallback;

  const path = target.split(/[?#]/)[0];
  const allowed = ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

  return allowed ? target : fallback;
}
