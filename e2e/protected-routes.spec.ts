import { expect, test } from "@playwright/test";

test.describe("logged-out route protection", () => {
  const protectedRoutes = [
    "/dashboard",
    "/search",
    "/library",
    "/watch-next",
    "/schedule",
    "/import",
    "/settings",
    "/settings/profile",
    "/settings/preferences",
    "/settings/notifications",
    "/settings/data",
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects to login without looping`, async ({ page }) => {
      await page.goto(route);

      await expect(page).toHaveURL("/auth/login");
      await expect(
        page.getByRole("heading", { level: 1, name: "Login" }),
      ).toBeVisible();
    });
  }

  test("reset-password without a recovery session returns to login", async ({
    page,
  }) => {
    await page.goto("/auth/reset-password");

    await expect(page).toHaveURL("/auth/login");
  });
});
