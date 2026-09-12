/**
 * Cabeçalhos de segurança (T1.5, achado F08).
 *
 * A CSP entra em modo Report-Only de propósito: ela ainda precisa de
 * `unsafe-inline` para o Next e para o tema, e ligar o bloqueio agora quebraria
 * a página. A versão com nonce, bloqueante, é a T5.1 — até lá, o relatório
 * mostra o que a política travaria.
 */
const isProduction = process.env.NODE_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-inline' e 'unsafe-eval' saem na T5.1, trocados por nonce.
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
  // HSTS só em produção: em desenvolvimento prenderia localhost em HTTPS.
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Não anunciar a versão do framework para quem está procurando alvo.
  poweredByHeader: false,
  // O servidor de E2E usa um diretório de build separado para não disputar o
  // `.next` com o `npm run dev` que você deixa aberto.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
