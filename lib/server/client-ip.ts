import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * IP de quem está chamando, com a confiança declarada no ambiente (F17).
 *
 * `X-Forwarded-For` é escrito pelo cliente e só depois acrescido pelos proxies.
 * Ler o primeiro valor — como o código fazia — significa aceitar o que o
 * atacante digitou: histórico de acesso falsificável e rate limit por IP inútil,
 * já que basta variar o cabeçalho para ganhar um balde novo a cada tentativa.
 *
 * Por isso nada é aceito por padrão. Quem está atrás de um proxy declara qual,
 * em `TRUSTED_PROXY`, e só então os cabeçalhos daquele proxy são lidos.
 */
export async function clientIp(): Promise<string | null> {
  let headerList: Headers;
  try {
    headerList = await headers();
  } catch {
    // Fora do ciclo de uma requisição (script, teste): não há IP.
    return null;
  }

  if (env.TRUSTED_PROXY === "vercel") {
    // A Vercel sobrescreve os dois; o cliente não consegue forjá-los.
    const vercelForwarded = headerList.get("x-vercel-forwarded-for");
    const first = vercelForwarded?.split(",")[0]?.trim();
    return first || headerList.get("x-real-ip") || null;
  }

  if (env.TRUSTED_PROXY === "last-hop") {
    // O último valor foi escrito pelo nosso proxy, e é o único confiável.
    const chain = headerList.get("x-forwarded-for");
    const hops =
      chain
        ?.split(",")
        .map((hop) => hop.trim())
        .filter(Boolean) ?? [];
    return hops.at(-1) ?? headerList.get("x-real-ip") ?? null;
  }

  return null;
}
