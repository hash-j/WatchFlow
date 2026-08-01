import { expect, test } from "./fixtures/qa";
import { developmentTargetGuard } from "./helpers/environment";

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

  test("sign-up success explains the email-confirmation state", async ({
    page,
  }) => {
    const response = await page.goto("/auth/sign-up-success");

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Thank you for signing up!",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Check your email to confirm", { exact: true }),
    ).toBeVisible();
  });

  test("invalid local sign-up data is rejected before account creation", async ({
    page,
  }) => {
    await page.goto("/auth/sign-up");
    await page.getByLabel("Email").fill("qa-invalid@example.invalid");
    const password = page.getByLabel("Password", { exact: true });
    const repeated = page.getByLabel("Repeat Password");
    await password.fill("LocalOnly!123");
    await repeated.fill("Different!123");

    try {
      await page.getByRole("button", { name: "Sign up" }).click();
      await expect(page.locator("form").getByRole("alert")).toHaveText(
        "Passwords do not match",
      );
      await expect(page).toHaveURL("/auth/sign-up");
    } finally {
      await password.fill("");
      await repeated.fill("");
    }
  });

  test("forgot-password requires a valid email field before requesting delivery", async ({
    page,
  }) => {
    await page.goto("/auth/forgot-password");
    const email = page.getByLabel("Email");

    await page.getByRole("button", { name: "Send reset email" }).click();
    await expect(email).toBeFocused();
    expect(
      await email.evaluate(
        (element: HTMLInputElement) => element.validity.valueMissing,
      ),
    ).toBe(true);
    await expect(page).toHaveURL("/auth/forgot-password");
  });

  test("invalid login shows an accessible provider error, not a network fallback", async ({
    page,
  }) => {
    test.skip(
      !developmentTargetGuard.enabled,
      developmentTargetGuard.reason,
    );
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
    const password = page.getByLabel("Password");
    try {
      await page.getByRole("button", { name: "Sign in" }).click();

      const alert = page.locator("form").getByRole("alert");
      await expect(alert).toHaveText("Email or password is incorrect.");
      await expect(alert).not.toContainText("Failed to fetch");
      await expect(page).toHaveURL("/auth/login");
    } finally {
      await password.fill("");
    }
  });

  test("invalid callback and confirmation links fail safely", async ({ page }) => {
    for (const path of ["/auth/callback", "/auth/confirm"]) {
      await page.goto(path);

      await expect(page).toHaveURL(/\/auth\/error\?reason=/);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Sorry, something went wrong.",
        }),
      ).toBeVisible();
    }
  });

  test("an untrusted callback next value never redirects off-site", async ({
    page,
  }) => {
    await page.goto(
      "/auth/callback?next=https%3A%2F%2Fexample.com%2Foutside",
    );

    await expect(page).toHaveURL(/\/auth\/error\?reason=/);
    expect(new URL(page.url()).origin).not.toBe("https://example.com");
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
