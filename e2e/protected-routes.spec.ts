import { expect, test } from "./fixtures/qa";

test.describe("logged-out route protection", () => {
  const protectedRoutes = [
    "/dashboard",
    "/search",
    "/library",
    "/library/42",
    "/lists",
    "/lists/11111111-1111-4111-8111-111111111111",
    "/picker",
    "/recommendations",
    "/statistics",
    "/watch-next",
    "/schedule",
    "/import",
    "/settings",
    "/settings/profile",
    "/settings/preferences",
    "/settings/notifications",
    "/settings/data",
    "/settings/data/export/csv",
    "/settings/data/export/json",
    "/protected",
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

  test("reset-password without a recovery session shows a controlled error", async ({
    page,
  }) => {
    await page.goto("/auth/reset-password");

    await expect(page).toHaveURL(
      "/auth/error?reason=recovery_session_required",
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Sorry, something went wrong.",
      }),
    ).toBeVisible();
  });

  test("update-password without a recovery session shows a controlled error", async ({
    page,
  }) => {
    await page.goto("/auth/update-password");

    await expect(page).toHaveURL(
      "/auth/error?reason=recovery_session_required",
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Sorry, something went wrong.",
      }),
    ).toBeVisible();
  });

});
