import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getProfile } from "@/lib/api";
import { revokeOtherSessions } from "@/lib/actions/auth";
import { createSession, createUserWithData } from "@/tests/factories";
import { signInAs } from "@/tests/setup/integration";

/**
 * F01: o cookie é um JWT, então continuava valendo por 30 dias mesmo depois do
 * logout ou de "encerrar outras sessões". A partir da T1.2 o token carrega um
 * `sessionId` e `requireUser()` confere a linha em `Session` — revogar no banco
 * derruba o cookie na requisição seguinte.
 */
describe("sessão revogada deixa de valer", () => {
  it("sessão ativa continua funcionando", async () => {
    const scenario = await createUserWithData();
    signInAs(scenario);

    await expect(getProfile()).resolves.toMatchObject({ email: scenario.user.email });
  });

  it("sessão revogada é recusada", async () => {
    const scenario = await createUserWithData();
    signInAs(scenario);

    await prisma.session.update({ where: { id: scenario.session.id }, data: { revokedAt: new Date() } });

    await expect(getProfile()).rejects.toMatchObject({ code: "NAO_AUTENTICADO" });
  });

  it("sessão vencida é recusada", async () => {
    const scenario = await createUserWithData();
    signInAs(scenario);

    await prisma.session.update({
      where: { id: scenario.session.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(getProfile()).rejects.toMatchObject({ code: "NAO_AUTENTICADO" });
  });

  it("token com sessionId inexistente é recusado", async () => {
    const scenario = await createUserWithData();
    signInAs({ user: scenario.user, session: { id: "sessao-que-nao-existe" } });

    await expect(getProfile()).rejects.toMatchObject({ code: "NAO_AUTENTICADO" });
  });

  it("token sem sessionId é recusado", async () => {
    const scenario = await createUserWithData();
    signInAs({ user: scenario.user });

    await expect(getProfile()).rejects.toMatchObject({ code: "NAO_AUTENTICADO" });
  });

  it("sessão de outro usuário não serve", async () => {
    const owner = await createUserWithData();
    const intruder = await createUserWithData();
    signInAs({ user: intruder.user, session: owner.session });

    await expect(getProfile()).rejects.toMatchObject({ code: "NAO_AUTENTICADO" });
  });

  it("12 horas parada encerra a sessão por inatividade", async () => {
    const scenario = await createUserWithData();
    const idle = await createSession(scenario.user.id, {
      lastSeenAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
    });
    signInAs({ user: scenario.user, session: idle });

    await expect(getProfile()).rejects.toMatchObject({ code: "NAO_AUTENTICADO" });

    const stored = await prisma.session.findUniqueOrThrow({ where: { id: idle.id } });
    expect(stored.revokedAt).not.toBeNull();
  });

  it("uso recente atualiza lastSeenAt, mas não a cada requisição", async () => {
    const scenario = await createUserWithData();
    const old = new Date(Date.now() - 30 * 60 * 1000);
    const session = await createSession(scenario.user.id, { lastSeenAt: old });
    signInAs({ user: scenario.user, session });

    await getProfile();
    const afterFirst = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(afterFirst.lastSeenAt.getTime()).toBeGreaterThan(old.getTime());

    await getProfile();
    const afterSecond = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(afterSecond.lastSeenAt.getTime()).toBe(afterFirst.lastSeenAt.getTime());
  });

  it('"encerrar outras sessões" derruba o outro navegador na próxima ação', async () => {
    const scenario = await createUserWithData();
    const outroNavegador = await createSession(scenario.user.id);

    // O outro navegador está autenticado e funcionando.
    signInAs({ user: scenario.user, session: outroNavegador });
    await expect(getProfile()).resolves.toBeTruthy();

    // A sessão atual encerra as demais.
    signInAs(scenario);
    const result = await revokeOtherSessions();
    expect(result.ok).toBe(true);

    // A próxima ação do outro navegador não passa mais.
    signInAs({ user: scenario.user, session: outroNavegador });
    await expect(getProfile()).rejects.toMatchObject({ code: "NAO_AUTENTICADO" });
  });
});
