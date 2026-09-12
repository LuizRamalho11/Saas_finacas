import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimiter } from "@/lib/server/rate-limit";

/**
 * Verificação de e-mail e senha, isolada do Auth.js para poder ser testada
 * diretamente — e para que o mesmo caminho valha tanto para a Server Action
 * quanto para quem chamar a rota do Auth.js na mão.
 *
 * Fecha três achados:
 * - F03: força bruta ilimitada, com um bcrypt por tentativa (DoS de CPU).
 * - F04: e-mail inexistente respondia sem rodar bcrypt, logo mais rápido —
 *   dava para descobrir quem tem conta só cronometrando.
 * - F17: o IP vinha de um cabeçalho que o cliente controla.
 */

/** Custo do bcrypt. Igual ao do seed: trocar aqui exige re-hash dos existentes. */
export const BCRYPT_COST = 10;

/**
 * Hash de uma senha aleatória, gerado na subida do processo. Serve para gastar
 * o mesmo tempo de CPU quando o e-mail não existe (F04). Nunca casa com nada e
 * não é segredo: não vai para o repositório nem para o banco.
 */
const DUMMY_HASH = bcrypt.hashSync(randomBytes(24).toString("hex"), BCRYPT_COST);

/** 5 tentativas por minuto por IP. */
export const IP_RULE = { limit: 5, windowMs: 60_000 };

/** 10 tentativas a cada 15 minutos por e-mail. */
export const EMAIL_RULE = { limit: 10, windowMs: 15 * 60_000 };

/** A partir da 10ª falha seguida, o bloqueio cresce a cada rodada. */
const LOCK_AFTER_FAILURES = 10;
const LOCK_STEPS_MS = [15 * 60_000, 60 * 60_000, 24 * 60 * 60_000];

export type CredentialFailure = "credenciais_invalidas" | "usuario_inexistente" | "bloqueado" | "limite_excedido";

export type CredentialResult =
  | { ok: true; user: { id: string; name: string; email: string } }
  | { ok: false; reason: CredentialFailure; userId?: string };

function lockDurationFor(failedCount: number): number {
  const step = Math.floor((failedCount - LOCK_AFTER_FAILURES) / LOCK_AFTER_FAILURES);
  return LOCK_STEPS_MS[Math.min(step, LOCK_STEPS_MS.length - 1)];
}

/**
 * Confere se o par e-mail/IP ainda tem tentativas na janela. Fica separado da
 * verificação da senha para a Server Action poder avisar o usuário antes de
 * gastar um bcrypt.
 */
export async function checkLoginRate(email: string, ip: string | null): Promise<boolean> {
  const limiter = rateLimiter();

  // Sem IP confiável, todo mundo divide o mesmo balde — de propósito: é melhor
  // limitar demais do que aceitar um cabeçalho forjado como chave.
  const ipResult = await limiter.hit(`login:ip:${ip ?? "sem-ip"}`, IP_RULE);
  const emailResult = await limiter.hit(`login:email:${email}`, EMAIL_RULE);

  return ipResult.ok && emailResult.ok;
}

export async function verifyCredentials(input: {
  email: string;
  password: string;
  ip: string | null;
}): Promise<CredentialResult> {
  const email = input.email.toLowerCase().trim();

  if (!(await checkLoginRate(email, input.ip))) {
    return { ok: false, reason: "limite_excedido" };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // F04: gasta o mesmo tempo de um usuário real antes de recusar.
    await bcrypt.compare(input.password, DUMMY_HASH);
    return { ok: false, reason: "usuario_inexistente" };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    // Também gasta o tempo, para o bloqueio não ser detectável pelo relógio.
    await bcrypt.compare(input.password, DUMMY_HASH);
    return { ok: false, reason: "bloqueado", userId: user.id };
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);

  if (!valid) {
    const failedLoginCount = user.failedLoginCount + 1;
    const shouldLock = failedLoginCount >= LOCK_AFTER_FAILURES;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount,
        ...(shouldLock ? { lockedUntil: new Date(Date.now() + lockDurationFor(failedLoginCount)) } : {}),
      },
    });

    return { ok: false, reason: "credenciais_invalidas", userId: user.id };
  }

  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  await rateLimiter().reset(`login:email:${email}`);

  return { ok: true, user: { id: user.id, name: user.name, email: user.email } };
}

/**
 * O login deste e-mail/IP está barrado agora? Usado só para escolher a mensagem
 * ao usuário — não gasta tentativa e não decide autenticação.
 */
export async function isLoginBlocked(email: string, ip: string | null): Promise<boolean> {
  const limiter = rateLimiter();
  const normalized = email.toLowerCase().trim();

  const [byIp, byEmail, user] = await Promise.all([
    limiter.peek(`login:ip:${ip ?? "sem-ip"}`, IP_RULE),
    limiter.peek(`login:email:${normalized}`, EMAIL_RULE),
    prisma.user.findUnique({ where: { email: normalized }, select: { lockedUntil: true } }),
  ]);

  const locked = Boolean(user?.lockedUntil && user.lockedUntil > new Date());
  return !byIp.ok || !byEmail.ok || locked;
}
