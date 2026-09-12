import { expect, test } from "@playwright/test";
import { E2E_USER } from "./support/user";

async function login(page: import("@playwright/test").Page, password = E2E_USER.password) {
  await page.goto("/login");
  await page.getByLabel("E-mail corporativo").fill(E2E_USER.email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar no painel" }).click();
}

test("entra com credenciais válidas e sai pelo menu da conta", async ({ page }) => {
  await login(page);

  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: `Menu da conta de ${E2E_USER.name}` }).click();
  await page.getByRole("menuitem", { name: "Sair da conta" }).click();

  await expect(page).toHaveURL(/\/login/);
});

test("senha errada não entra e mostra o erro", async ({ page }) => {
  await login(page, "senha-errada-de-proposito");

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("rota protegida sem sessão manda para o login", async ({ page }) => {
  await page.goto("/transactions");

  await expect(page).toHaveURL(/\/login\?redirectTo=%2Ftransactions/);
});

/**
 * F01: o cookie de sessão é um JWT e, antes da T1.2, continuava válido depois do
 * logout. Aqui guardamos o cookie, saímos e devolvemos o cookie ao navegador.
 */
test("cookie reaproveitado depois do logout não vale mais", async ({ page, context }) => {
  await login(page);
  await expect(page).toHaveURL(/\/dashboard$/);

  const cookiesDaSessao = await context.cookies();

  await page.getByRole("button", { name: `Menu da conta de ${E2E_USER.name}` }).click();
  await page.getByRole("menuitem", { name: "Sair da conta" }).click();
  await expect(page).toHaveURL(/\/login/);

  await context.addCookies(cookiesDaSessao);
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Entrar no painel" })).toBeVisible();
});

/**
 * F02: `?redirectTo=//site-malicioso.com` levava o usuário para fora do domínio
 * logo depois de digitar a senha — o golpe clássico de phishing pós-login.
 */
test("redirectTo apontando para fora do domínio cai no dashboard", async ({ page }) => {
  await page.goto("/login?redirectTo=//site-malicioso.com");
  await page.getByLabel("E-mail corporativo").fill(E2E_USER.email);
  await page.getByLabel("Senha").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Entrar no painel" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
});

test("redirectTo interno e conhecido é respeitado", async ({ page }) => {
  await page.goto("/login?redirectTo=%2Ftransactions");
  await page.getByLabel("E-mail corporativo").fill(E2E_USER.email);
  await page.getByLabel("Senha").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Entrar no painel" }).click();

  await expect(page).toHaveURL(/\/transactions$/);
});

/**
 * A rota que limpa o cookie é um GET que encerra a sessão. Se qualquer site
 * pudesse disparar por `<img src>`, deslogaria quem estivesse usando o produto.
 */
test("subrequisição de outro site não consegue encerrar a sessão", async ({ page, context }) => {
  await login(page);
  await expect(page).toHaveURL(/\/dashboard$/);

  const resposta = await context.request.get("/api/session/expired", {
    headers: { "sec-fetch-dest": "image", "sec-fetch-mode": "no-cors", "sec-fetch-site": "cross-site" },
  });
  expect(resposta.status()).toBe(204);

  // A sessão continua de pé.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
});
