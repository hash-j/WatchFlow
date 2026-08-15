import { expect, test } from "./fixtures/qa";
import {
  expectFormsFitViewport,
  expectResponsivePage,
} from "./helpers/responsive";

const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 600, height: 960 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

const publicRoutes = [
  "/",
  "/auth/login",
  "/auth/sign-up",
  "/auth/forgot-password",
  "/auth/update-password",
  "/auth/reset-password",
  "/auth/error?reason=invalid_link",
] as const;

test.describe("public responsive shell", () => {
  for (const viewport of viewports) {
    test(`public routes fit ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);

      for (const route of publicRoutes) {
        const response = await page.goto(route);
        expect(response?.status(), route).toBeLessThan(400);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectResponsivePage(page);
        await expectFormsFitViewport(page);

        if (route === "/auth/sign-up") {
          await expect(
            page.getByRole("button", { name: "Sign up" }),
          ).toBeVisible();
        }
      }
    });
  }
});
