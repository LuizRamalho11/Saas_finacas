/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O servidor de E2E usa um diretório de build separado para não disputar o
  // `.next` com o `npm run dev` que você deixa aberto.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
