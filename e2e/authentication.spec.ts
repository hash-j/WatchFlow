import { expect, test } from "@playwright/test";

test.describe("authentication regressions", () => {
  test("public authentication pages load with semantic headings and labels", async ({
    page,
  }) => {
    const routes = [
      {
        path: "/auth/login",
        heading: "Login",
        labels: ["Email", "Password"],
      },
      {
        path: "/auth/sign-up",
        heading: "Sign up",
        labels: ["Email", "Password", "Repeat Password"],
      },
      {
        path: "/auth/forgot-password",
        heading: "Reset Your Password",
        labels: ["Email"],
      },
    ] as const;

    for (const route of routes) {
      const response = await page.goto(route.path);

      expect(response?.status(), route.path).toBeLessThan(400);
      await expect(page, route.path).toHaveURL(route.path);
      await expect(
        page.getByRole("heading", { level: 1, name: route.heading }),
        route.path,
      ).toBeVisible();

      for (const label of route.labels) {
        await expect(
          page.getByLabel(label, { exact: true }),
          `${route.path}: ${label}`,
        ).toBeVisible();
      }
    }
  });

  test("the canonical sign-up route remains public and non-404", async ({
    page,
  }) => {
    const response = await page.goto("/auth/sign-up");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL("/auth/sign-up");
    await expect(
      page.getByRole("button", { name: "Sign up" }),
    ).toBeEnabled();
  });

  test("invalid login shows an accessible provider error, not a network fallback", async ({
    page,
  }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email").fill("qa-invalid@example.invalid");
    await page.getByLabel("Password").evaluate((element: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      const generatedNonCredential = `Qa!${window.crypto.randomUUID()}9z`;

      setter?.call(element, generatedNonCredential);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = page.locator("form").getByRole("alert");
    await expect(alert).toHaveText("Invalid login credentials");
    await expect(alert).not.toContainText("Failed to fetch");
    await expect(page).toHaveURL("/auth/login");
  });

  test("invalid callback and confirmation links fail safely", async ({ page }) => {
    for (const path of ["/auth/callback", "/auth/confirm"]) {
      await page.goto(path);

      await expect(page).toHaveURL(/\/auth\/error\?error=/);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Sorry, something went wrong.",
        }),
      ).toBeVisible();
    }
  });

  test("sign-up has a logical keyboard order with visible focus", async ({
    page,
  }) => {
    await page.goto("/auth/sign-up");

    const expected = [
      page.getByLabel("Email"),
      page.getByLabel("Password", { exact: true }),
      page.getByLabel("Repeat Password"),
      page.getByRole("button", { name: "Sign up" }),
      page.getByRole("link", { name: "Login" }),
    ];

    for (const locator of expected) {
      await page.keyboard.press("Tab");
      await expect(locator).toBeFocused();
    }
  });
});
