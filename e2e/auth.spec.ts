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
