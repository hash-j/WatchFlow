import { expect, test } from "./fixtures/qa";

test("public release information is linked, readable without login and publishes the approved support contact", async ({ page }) => {
  await page.goto("/auth/sign-up");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute("href", "/privacy");
  await expect(footer.getByRole("link", { name: "Account & data deletion", exact: true })).toHaveAttribute("href", "/data-deletion");
  for (const [path, heading] of [
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms & acceptable use"],
    ["/support", "Help & contact"],
    ["/data-deletion", "Account & data deletion"],
    ["/about", "About & credits"],
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "hashim.ghub@gmail.com", exact: true }).first()).toHaveAttribute("href", "mailto:hashim.ghub@gmail.com");
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "hashim.ghub@gmail.com", exact: true })).toHaveAttribute("href", "mailto:hashim.ghub@gmail.com");
    await expect(page.locator("body")).not.toContainText(/MANUAL[_ ]ACTION[_ ]REQUIRED/);
  }
  await expect(page.getByText("This product uses the TMDB API but is not endorsed or certified by TMDB.", { exact: true })).toBeVisible();
  const logo = page.getByRole("img", { name: "The Movie Database (TMDB)", exact: true });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: "The Movie Database (TMDB)", exact: true })).toHaveAttribute("href", "https://www.themoviedb.org/");

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Optional Google Calendar connection" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notifications and reminders" })).toBeVisible();
  await page.goto("/data-deletion");
  await expect(page.getByText("DELETE", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "password recovery", exact: true })).toHaveAttribute("href", "/auth/forgot-password");

  await page.goto("/support");
  await expect(page.getByText("Operator name: WatchFlow.", { exact: true })).toBeVisible();
  expect(await page.locator('a[href^="mailto:"]').evaluateAll((links) => links.every((link) => link.getAttribute("href") === "mailto:hashim.ghub@gmail.com"))).toBe(true);
});
