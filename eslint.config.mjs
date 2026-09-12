import { FlatCompat } from "@eslint/eslintrc";
import security from "eslint-plugin-security";
import prettier from "eslint-config-prettier";
import { noServerModuleInClientComponent } from "./eslint-rules/no-server-module-in-client-component.mjs";

// O eslint-config-next ainda é distribuído no formato antigo; o FlatCompat é a
// forma documentada pelo Next 15 de usá-lo na configuração flat.
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const finora = {
  rules: { "no-server-module-in-client-component": noServerModuleInClientComponent },
};

const config = [
  {
    ignores: [
      ".next/**",
      ".next-e2e/**",
      ".postgres/**",
      ".postgres-test/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },

  ...compat.config({ extends: ["next/core-web-vitals", "next/typescript"] }),

  security.configs.recommended,

  {
    plugins: { finora },
    rules: {
      "finora/no-server-module-in-client-component": "error",

      // Em TypeScript, ler `objeto[chave]` com uma chave tipada é seguro e
      // comum no projeto (mapas de rótulo, Record<Period, number>). A regra
      // acusa todos esses casos e nenhum acesso perigoso de verdade, então o
      // ruído esconderia os avisos que importam. O resto do plugin continua on.
      "security/detect-object-injection": "off",

      // Nada de log solto; `console.error`/`warn` ficam liberados para o
      // tratamento de erro que já existe nas actions.
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },

  // Scripts de infraestrutura e seed rodam no terminal: printar é o objetivo.
  {
    files: ["scripts/**", "prisma/**", "tests/**", "e2e/**", "*.mjs", "*.ts"],
    rules: { "no-console": "off" },
  },

  // Infraestrutura de teste e scripts locais mexem em caminhos fixos do próprio
  // repositório (o diretório do cluster de teste, por exemplo). Não há entrada
  // de usuário envolvida, que é o risco que esta regra existe para pegar.
  {
    files: ["tests/**", "scripts/**", "e2e/**"],
    rules: { "security/detect-non-literal-fs-filename": "off" },
  },

  // Desliga as regras de formatação: quem formata é o Prettier.
  prettier,
];

export default config;
