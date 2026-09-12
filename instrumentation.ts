/**
 * Roda uma vez, quando o servidor Next sobe.
 *
 * Importar `lib/env` aqui faz a validação das variáveis de ambiente acontecer
 * na partida: se faltar alguma, o servidor nem começa a aceitar requisições.
 *
 * `NEXT_RUNTIME` é um marcador do próprio Next (não é configuração do app), e
 * a validação só faz sentido no runtime Node, onde ficam os segredos.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}
