import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirecionamento de conveniência apenas.
 *
 * O middleware roda no runtime Edge, onde o Prisma não pode ser carregado, então
 * aqui só checamos a *presença* do cookie de sessão. A autorização de verdade
 * (validar o token e o dono de cada registro) acontece em `requireUser()`, no
 * servidor, antes de qualquer leitura ou escrita.
 */
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

const PROTECTED_PREFIXES = ["/dashboard", "/cash-flow", "/transactions", "/reports", "/settings"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = SESSION_COOKIES.some((name) => request.cookies.has(name));

  if (!hasSessionCookie && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSessionCookie && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
