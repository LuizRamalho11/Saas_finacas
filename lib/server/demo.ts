import { env } from "@/lib/env";

/**
 * Regras do modo demonstração (F10).
 *
 * A versão de vitrine preenche o formulário de login e anuncia que é uma
 * demonstração. Em produção nada disso pode aparecer — e o seed, que cria um
 * usuário de senha conhecida, não pode nem começar.
 */
export function isDemoMode(): boolean {
  return env.APP_MODE === "demo";
}

/** Credenciais mostradas na tela de login, só no modo demonstração. */
export function demoCredentials(): { email: string; password: string } | null {
  if (!isDemoMode() || !env.DEMO_PASSWORD) return null;
  return { email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD };
}

export class SeedRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedRefused";
  }
}

/**
 * O seed apaga e recria um usuário de senha conhecida. Rodar isso contra
 * produção por engano seria criar uma porta dos fundos com senha publicada.
 */
export function assertSeedAllowed(options: {
  nodeEnv: string;
  appMode: string;
  demoPassword?: string;
  force: boolean;
}) {
  if (options.nodeEnv === "production" && !options.force) {
    throw new SeedRefused(
      "Seed recusado: NODE_ENV=production. Ele cria um usuário com senha conhecida. " +
        "Se é mesmo um ambiente de demonstração, rode com --force-demo.",
    );
  }

  if (options.appMode !== "demo" && !options.force) {
    throw new SeedRefused(
      "Seed recusado: APP_MODE não está como demo. Defina APP_MODE=demo no .env ou rode com --force-demo.",
    );
  }

  if (!options.demoPassword) {
    throw new SeedRefused("Seed recusado: defina DEMO_PASSWORD no .env. A senha da demonstração não fica no código.");
  }
}
