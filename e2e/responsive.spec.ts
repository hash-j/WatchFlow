import { expect, test } from "./fixtures/qa";

const viewports = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
];

test.describe("public responsive shell", () => {
  for (const viewport of viewports) {
    test(`sign-up fits ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/auth/sign-up");

      const measurements = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        fieldsFit: Array.from(document.querySelectorAll("input")).every(
          (element) => {
            const box = element.getBoundingClientRect();
            return box.left >= 0 && box.right <= window.innerWidth;
          },
        ),
      }));

      expect(measurements.documentWidth).toBeLessThanOrEqual(
        measurements.viewportWidth,
      );
      expect(measurements.fieldsFit).toBe(true);
      await expect(
        page.getByRole("button", { name: "Sign up" }),
      ).toBeVisible();
    });
  }
});
