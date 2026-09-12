import { NextResponse } from "next/server";
import { signOut } from "@/auth";

/**
 * Limpa um cookie de sessão que não corresponde mais a uma sessão válida.
 *
 * O middleware só enxerga a *presença* do cookie, então sem apagá-lo aqui o
 * usuário ficaria preso num laço: /dashboard manda para /login e /login devolve
 * para /dashboard. Rotas /api ficam fora do matcher do middleware, o que torna
 * este endpoint o lugar certo para quebrar o ciclo.
 *
 * Como é um GET que muda estado (encerra a sessão), só aceitamos navegação de
 * verdade. Sem isso, um `<img src="…/api/session/expired">` em qualquer site
 * deslogaria quem estivesse usando o Finora — CSRF de logout.
 */
function isNavegacao(request: Request): boolean {
  const destino = request.headers.get("sec-fetch-dest");
  const modo = request.headers.get("sec-fetch-mode");

  // Navegador antigo que não manda Sec-Fetch-*: não dá para distinguir, aceita.
  if (!destino && !modo) return true;

  return destino === "document" && modo === "navigate";
}

export async function GET(request: Request) {
  if (!isNavegacao(request)) {
    // Não encerra nada: só responde algo inócuo para a subrequisição.
    return new NextResponse(null, { status: 204 });
  }

  await signOut({ redirect: false });
  return NextResponse.redirect(new URL("/login?expired=1", request.url));
}
