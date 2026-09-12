/**
 * Usuário fixo dos testes de ponta a ponta. Vive só no banco de E2E
 * (`.postgres-e2e`), criado pelo `scripts/e2e-server.mjs` a cada execução —
 * nada a ver com o usuário de demonstração do seed.
 */
export const E2E_USER = {
  name: "Marina Teste",
  email: "marina.teste@finora.test",
  password: "senha-de-ponta-a-ponta",
};
