import { expect, test } from "./fixtures/qa";
import {
  expectNoUnexpectedBrowserFailures,
  monitorBrowserFailures,
} from "./helpers/diagnostics";
import {
  authenticatedQaGuard,
  developmentTargetGuard,
  getQaCredentials,
} from "./helpers/environment";

test.describe("authentication regressions", () => {
  test("public authentication pages load with semantic headings and labels", async ({
    page,
  }) => {
    const routes = [
      {
        path: "/auth/login",
        heading: "Log in to WatchFlow",
        labels: ["Email", "Password"],
      },
      {
        path: "/auth/sign-up",
        heading: "Create your account",
        labels: ["Full name", "Email", "Password", "Confirm password"],
      },
      {
        path: "/auth/forgot-password",
        heading: "Forgot your password?",
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
      page.getByRole("button", { name: "Create account" }),
    ).toBeEnabled();
  });

  test("legacy signup success safely enters verification recovery", async ({
    page,
  }) => {
    const response = await page.goto("/auth/sign-up-success");

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL("/auth/verify-email");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Check your email",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Return to signup" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Forgot password" }),
    ).toBeVisible();
  });

  test("invalid local sign-up data is rejected before account creation", async ({
    page,
  }) => {
    await page.goto("/auth/sign-up");
    await page.getByLabel("Full name").fill("QA Local");
    await page.getByLabel("Email").fill("qa-invalid@example.invalid");
    const password = page.getByLabel("Password", { exact: true });
    const repeated = page.getByLabel("Confirm password", { exact: true });
    await password.fill("LocalOnly!123");
    await repeated.fill("Different!123");

    try {
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(page.getByText("Passwords do not match.")).toBeVisible();
      await expect(page).toHaveURL("/auth/sign-up");
    } finally {
      await password.fill("");
      await repeated.fill("");
    }
  });

  test("an existing confirmed signup reaches privacy-safe recovery choices", async ({
    page,
  }) => {
    test.skip(!authenticatedQaGuard.enabled, authenticatedQaGuard.reason);
    const { email } = getQaCredentials("A");
    const nonCredentialPassword = "ExistingSignupCheck!9z";

    await page.goto("/auth/sign-up");
    await page.getByLabel("Full name").fill("Existing WatchFlow member");
    await page.getByLabel("Email").fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(nonCredentialPassword);
    await page
      .getByLabel("Confirm password", { exact: true })
      .fill(nonCredentialPassword);

    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL("/auth/verify-email");
    await expect(
      page.getByText(
        "If this email is new to WatchFlow, we sent a 6-digit verification code.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("We sent a 6-digit verification code to your email."),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Forgot password" }),
    ).toBeVisible();
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
    browserAudit,
    page,
  }) => {
    test.skip(
      !developmentTargetGuard.enabled,
      developmentTargetGuard.reason,
    );
    await page.goto("/auth/login");
    await page.getByLabel("Email").fill("qa-invalid@example.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .evaluate((element: HTMLInputElement) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        const generatedNonCredential = `Qa!${window.crypto.randomUUID()}9z`;

        setter?.call(element, generatedNonCredential);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      });
    const password = page.getByLabel("Password", { exact: true });
    browserAudit.stop();
    const expectedProviderDenial = monitorBrowserFailures(page);
    try {
      await page.getByRole("button", { name: "Sign in" }).click();

      const alert = page.locator("form").getByRole("alert");
      await expect(alert).toHaveText("Email or password is incorrect.");
      await expect(alert).not.toContainText("Failed to fetch");
      await expect(page).toHaveURL("/auth/login");
      expectNoUnexpectedBrowserFailures(expectedProviderDenial, {
        allowedHttpFailures: [
          {
            status: 400,
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/auth\/v1\/token$/,
          },
        ],
        allowedConsoleFailures: [
          {
            category: "browser-runtime",
            locationPattern:
              /^https:\/\/[^/]+\.supabase\.co\/auth\/v1\/token$/,
          },
        ],
      });
    } finally {
      expectedProviderDenial.stop();
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
          name: "We couldn’t complete that request",
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
      page.getByRole("link", { name: "WatchFlow" }),
      page.getByLabel("Full name"),
      page.getByLabel("Email"),
      page.getByLabel("Password", { exact: true }),
      page.getByRole("button", { name: "Show password" }),
      page.getByLabel("Confirm password", { exact: true }),
      page.getByRole("button", { name: "Show confirm password" }),
      page.getByRole("button", { name: "Create account" }),
      page.getByRole("link", { name: "Log in" }),
    ];

    for (const locator of expected) {
      await page.keyboard.press("Tab");
      await expect(locator).toBeFocused();
    }
  });

  test("verification code supports numeric keyboard entry, full paste, and resend countdown", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) {
      throw new Error("Playwright base URL is required for the verification test.");
    }

    const now = Date.now();
    const pending = Buffer.from(JSON.stringify({
      email: "qa-verification@example.com",
      expiresAt: now + 10 * 60_000,
      resendAvailableAt: now + 60_000,
    }), "utf8").toString("base64url");
    await context.addCookies([{ name: "watchflow_pending_verification", value: pending, url: new URL("/auth", baseURL).toString(), httpOnly: true, sameSite: "Lax" }]);

    await page.goto("/auth/verify-email");
    await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
    await expect(
      page.getByText(
        "If this email is new to WatchFlow, we sent a 6-digit verification code.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("We sent a 6-digit verification code to your email."),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Enter verification code",
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Forgot password" }),
    ).toBeVisible();
    await expect(page.getByTestId("otp-position")).toHaveCount(6);
    const code = page.getByLabel("Verification code", { exact: true });
    await code.pressSequentially("123456");
    await expect(code).toHaveValue("123456");
    await code.fill("");
    await code.evaluate((element: HTMLInputElement) => {
      const data = new DataTransfer();
      data.setData("text/plain", "12 34-56");
      element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData: data }));
    });
    await expect(code).toHaveValue("123456");
    await expect(page.getByRole("button", { name: /Resend code in \d+s/ })).toBeDisabled();
  });
});
