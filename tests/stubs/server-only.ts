// O pacote `server-only` existe para quebrar o build quando um módulo de
// servidor é importado pelo cliente. Fora do Next ele lança sempre, então nos
// testes ele é trocado por este stub vazio (alias em vitest.config.ts).
export {};
