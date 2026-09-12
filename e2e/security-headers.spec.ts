import { expect, test } from "@playwright/test";

/**
 * F08: a aplicação respondia sem nenhum cabeçalho de segurança e ainda
 * anunciava o framework no `X-Powered-By`.
 */
test("as respostas trazem os cabeçalhos de segurança", async ({ page }) => {
  const response = await page.goto("/login");
  const headers = response!.headers();

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");

  // A CSP começa em modo relatório; a versão bloqueante com nonce é a T5.1.
  expect(headers["content-security-policy-report-only"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toBeUndefined();

  expect(headers["x-powered-by"]).toBeUndefined();
});

test("a tela de login continua inteira com os cabeçalhos aplicados", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("button", { name: "Entrar no painel" })).toBeVisible();
  // Se a CSP estivesse bloqueando o CSS, o botão não teria fundo pintado.
  const cor = await page
    .getByRole("button", { name: "Entrar no painel" })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(cor).not.toBe("rgba(0, 0, 0, 0)");
});

/**
 * F10: o formulário vinha com as credenciais do seed preenchidas e anunciando
 * "ambiente de demonstração" — inclusive num deploy de produção. O servidor de
 * E2E roda sem APP_MODE, ou seja, em modo produção.
 */
test("fora do modo demonstração, o login abre vazio", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByLabel("E-mail corporativo")).toHaveValue("");
  await expect(page.getByLabel("Senha")).toHaveValue("");
  await expect(page.getByText("Ambiente de demonstração")).toHaveCount(0);
});
