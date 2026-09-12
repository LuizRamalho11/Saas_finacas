import { NextResponse } from "next/server";
import { signOut } from "@/auth";

/**
 * Limpa um cookie de sessão que não corresponde mais a um usuário existente.
 *
 * O middleware só enxerga a *presença* do cookie, então sem apagá-lo aqui o
 * usuário ficaria preso num laço: /dashboard manda para /login e /login devolve
 * para /dashboard. Rotas /api ficam fora do matcher do middleware, o que torna
 * este endpoint o lugar certo para quebrar o ciclo.
 */
export async function GET(request: Request) {
  await signOut({ redirect: false });
  return NextResponse.redirect(new URL("/login?expired=1", request.url));
}
