import { expect, type Page } from "@playwright/test";

import type { QaCredentials } from "./environment";

async function clearPasswordIfVisible(page: Page) {
  const password = page.getByLabel("Password", { exact: true });
  if (await password.isVisible().catch(() => false)) {
    await password.fill("");
  }
}

async function dismissDevelopmentTools(page: Page) {
  await page
    .locator("nextjs-portal")
    .evaluate((element) => element.remove())
    .catch(() => undefined);
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
      page.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeVisible({ timeout: 30_000 });
  } catch (error) {
    await clearPasswordIfVisible(page);
    throw error;
  }
}

export async function logout(page: Page) {
  const signOutButton = page
    .locator("button:visible")
    .filter({ hasText: /^Sign out$/ });
  await expect(signOutButton).toHaveCount(1);
  await dismissDevelopmentTools(page);
  await Promise.all([
    page.waitForURL(/\/auth\/login$/, { timeout: 30_000 }),
    signOutButton.click(),
  ]);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Log in to WatchFlow",
    }),
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
