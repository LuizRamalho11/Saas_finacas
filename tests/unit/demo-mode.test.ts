import { describe, expect, it } from "vitest";
import { assertSeedAllowed, SeedRefused } from "@/lib/server/demo";

/**
 * F10: o seed cria um usuário com senha conhecida. Rodar isso contra produção
 * por engano é abrir uma porta dos fundos com a senha publicada no README.
 */
const DEMO_OK = { nodeEnv: "development", appMode: "demo", demoPassword: "senha-da-demo", force: false };

describe("assertSeedAllowed", () => {
  it("libera o ambiente de demonstração configurado", () => {
    expect(() => assertSeedAllowed(DEMO_OK)).not.toThrow();
  });

  it("recusa em produção", () => {
    expect(() => assertSeedAllowed({ ...DEMO_OK, nodeEnv: "production" })).toThrow(SeedRefused);
    expect(() => assertSeedAllowed({ ...DEMO_OK, nodeEnv: "production" })).toThrow(/--force-demo/);
  });

  it("recusa quando o modo não é demonstração", () => {
    expect(() => assertSeedAllowed({ ...DEMO_OK, appMode: "production" })).toThrow(/APP_MODE/);
  });

  it("recusa sem senha de demonstração definida", () => {
    expect(() => assertSeedAllowed({ ...DEMO_OK, demoPassword: undefined })).toThrow(/DEMO_PASSWORD/);
  });

  it("--force-demo passa por cima do ambiente, mas não da senha ausente", () => {
    expect(() => assertSeedAllowed({ ...DEMO_OK, nodeEnv: "production", force: true })).not.toThrow();
    expect(() => assertSeedAllowed({ ...DEMO_OK, demoPassword: undefined, force: true })).toThrow(/DEMO_PASSWORD/);
  });
});
