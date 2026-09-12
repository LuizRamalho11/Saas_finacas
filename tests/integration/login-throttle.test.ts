import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { BCRYPT_COST, verifyCredentials } from "@/lib/auth/credentials";
import { resetRateLimiterForTests } from "@/lib/server/rate-limit";
import { createUser } from "@/tests/factories";

/**
 * T1.4 — F03 (força bruta sem limite, com um bcrypt por tentativa) e F04
 * (e-mail inexistente respondia mais rápido, o que denuncia quem tem conta).
 */
const SENHA = "senha-correta-do-teste";

async function criarUsuario() {
  return createUser({ passwordHash: await bcrypt.hash(SENHA, BCRYPT_COST) });
}

beforeEach(() => {
  resetRateLimiterForTests();
});

describe("limite de tentativas de login", () => {
  it("a sexta tentativa no mesmo minuto é barrada", async () => {
    const user = await criarUsuario();
    const ip = "203.0.113.10";

    for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
      const result = await verifyCredentials({ email: user.email, password: "senha-errada", ip });
      expect(result).toMatchObject({ ok: false, reason: "credenciais_invalidas" });
    }

    const sexta = await verifyCredentials({ email: user.email, password: SENHA, ip });
    expect(sexta).toMatchObject({ ok: false, reason: "limite_excedido" });
  });

  it("o limite por IP não derruba outro IP", async () => {
    const user = await criarUsuario();

    for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
      await verifyCredentials({ email: user.email, password: "senha-errada", ip: "203.0.113.20" });
    }

    const deOutroIp = await verifyCredentials({ email: user.email, password: SENHA, ip: "203.0.113.21" });
    expect(deOutroIp.ok).toBe(true);
  });
});

describe("bloqueio progressivo da conta", () => {
  it("dez falhas seguidas bloqueiam temporariamente, mesmo com a senha certa", async () => {
    const user = await criarUsuario();

    for (let tentativa = 1; tentativa <= 10; tentativa += 1) {
      resetRateLimiterForTests();
      await verifyCredentials({ email: user.email, password: "senha-errada", ip: `203.0.113.${tentativa}` });
    }

    const bloqueado = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(bloqueado.failedLoginCount).toBe(10);
    expect(bloqueado.lockedUntil).not.toBeNull();
    expect(bloqueado.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    resetRateLimiterForTests();
    const comSenhaCerta = await verifyCredentials({ email: user.email, password: SENHA, ip: "203.0.113.99" });
    expect(comSenhaCerta).toMatchObject({ ok: false, reason: "bloqueado" });
  });

  it("acertar a senha zera o contador de falhas", async () => {
    const user = await criarUsuario();

    await verifyCredentials({ email: user.email, password: "senha-errada", ip: "203.0.113.30" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).failedLoginCount).toBe(1);

    const ok = await verifyCredentials({ email: user.email, password: SENHA, ip: "203.0.113.30" });
    expect(ok.ok).toBe(true);

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(depois.failedLoginCount).toBe(0);
    expect(depois.lockedUntil).toBeNull();
  });

  it("o bloqueio expirado volta a aceitar a senha certa", async () => {
    const user = await criarUsuario();
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 10, lockedUntil: new Date(Date.now() - 1_000) },
    });

    const result = await verifyCredentials({ email: user.email, password: SENHA, ip: "203.0.113.40" });
    expect(result.ok).toBe(true);
  });
});

describe("tempo constante entre e-mail inexistente e senha errada (F04)", () => {
  it("a diferença das medianas fica abaixo de 20%", async () => {
    const user = await criarUsuario();
    const AMOSTRAS = 15;

    async function medir(email: string): Promise<number> {
      resetRateLimiterForTests();
      const inicio = performance.now();
      await verifyCredentials({ email, password: "qualquer-senha-errada", ip: "203.0.113.50" });
      return performance.now() - inicio;
    }

    const mediana = (valores: number[]) => [...valores].sort((a, b) => a - b)[Math.floor(valores.length / 2)];

    const inexistentes: number[] = [];
    const senhaErrada: number[] = [];

    // Intercalado, para que uma oscilação da máquina atinja os dois grupos.
    for (let i = 0; i < AMOSTRAS; i += 1) {
      inexistentes.push(await medir(`ninguem-${i}@finora.test`));
      senhaErrada.push(await medir(user.email));
    }

    const a = mediana(inexistentes);
    const b = mediana(senhaErrada);
    const diferenca = Math.abs(a - b) / Math.max(a, b);

    expect(diferenca).toBeLessThan(0.2);
  });
});
