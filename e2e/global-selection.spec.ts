import { expect, test } from "./fixtures/qa";

test.use({ trace: "off", video: "off" });

const viewports = [
  { width: 390, height: 844, label: "mobile" },
  { width: 820, height: 1180, label: "tablet" },
  { width: 1366, height: 768, label: "desktop" },
] as const;

for (const theme of ["light", "dark"] as const) {
  for (const viewport of viewports) {
    test(`Ctrl+A remains native in ${theme} mode at the ${viewport.label} viewport`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((selectedTheme) => {
        window.localStorage.setItem("theme", selectedTheme);
      }, theme);

      await page.goto("/auth/login");
      await expect(page.locator("html")).toHaveClass(new RegExp(`(^| )${theme}( |$)`));

      await page.locator("main").click({ position: { x: 8, y: 8 } });
      await page.keyboard.press("Control+A");
      const selectedPageText = await page.evaluate(() =>
        window.getSelection()?.toString().trim(),
      );
      expect(selectedPageText).toContain("WatchFlow");

      const email = page.getByLabel("Email");
      const inputValue = "selection-check@example.com";
      await email.fill(inputValue);
      await email.press("Control+A");
      await email.press("Backspace");
      await expect(email).toHaveValue("");

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasHorizontalOverflow).toBe(false);
    });
  }
}
