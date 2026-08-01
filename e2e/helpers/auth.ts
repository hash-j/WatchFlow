import { expect, type Page } from "@playwright/test";

import type { QaCredentials } from "./environment";

async function clearPasswordIfVisible(page: Page) {
  const password = page.getByLabel("Password", { exact: true });
  if (await password.isVisible().catch(() => false)) {
    await password.fill("");
  }
}

export async function login(page: Page, credentials: QaCredentials) {
  await page.goto("/auth/login");
  await page.getByLabel("Email", { exact: true }).fill(credentials.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.password);

  try {
    await Promise.all([
      page.waitForURL(/\/dashboard(?:\?.*)?$/),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
    await expect(
      page.getByRole("heading", { level: 1, name: /^Welcome/ }),
    ).toBeVisible();
  } catch (error) {
    await clearPasswordIfVisible(page);
    throw error;
  }
}

export async function logout(page: Page) {
  await Promise.all([
    page.waitForURL(/\/auth\/login$/),
    page.getByRole("button", { name: "Sign out" }).click(),
  ]);
  await expect(
    page.getByRole("heading", { level: 1, name: "Login" }),
  ).toBeVisible();
}

export async function expectLoginRejected(
  page: Page,
  credentials: QaCredentials,
) {
  await page.goto("/auth/login");
  await page.getByLabel("Email", { exact: true }).fill(credentials.email);
  const password = page.getByLabel("Password", { exact: true });
  await password.fill(credentials.password);

  try {
    await page.getByRole("button", { name: "Sign in" }).click();
    const alert = page.locator("form").getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText("Failed to fetch");
    await expect(page).toHaveURL("/auth/login");
  } finally {
    await password.fill("");
  }
}
