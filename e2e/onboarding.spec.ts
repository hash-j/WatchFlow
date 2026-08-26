import { test, expect } from "./fixtures/qa";
import { login, logout } from "./helpers/auth";
import { clickAndWaitForMutation } from "./helpers/assertions";
import {
  authenticatedQaGuard,
  getOnboardingMovieQueries,
  getQaCredentials,
} from "./helpers/environment";
import { removeControlledMovie, type ControlledMovie } from "./helpers/movies";
import { setOwnOnboardingCompletion } from "./helpers/onboarding";
import {
  expectFormsFitViewport,
  expectResponsivePage,
} from "./helpers/responsive";

test.use({ trace: "off", video: "off" });

async function searchOnboardingMovie(page: Parameters<typeof login>[0], query: string) {
  await page.getByLabel("Movie title").fill(query);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/onboarding" && url.searchParams.get("step") === "3" && url.searchParams.has("q")),
    page.getByRole("button", { name: "Search", exact: true }).click(),
  ]);
  const result = page.locator("article").filter({ has: page.locator("[data-tmdb-id]") }).first();
  const fallback = page.locator("article[data-tmdb-id]").first();
  return (await result.count()) > 0 ? result : fallback;
}

function declareOnboardingSuite() {
  test.describe("first-time onboarding", () => {
    test("verified incomplete user saves preferences, survives refresh, completes, and stays complete", async ({ page }) => {
      await setOwnOnboardingCompletion("A", null);
      try {
        await login(page, getQaCredentials("A"));
        await page.goto("/onboarding");
        await expect(page.getByRole("heading", { level: 1, name: /Your movie life/ })).toBeVisible();
        await expect(page.getByText("1 of 3")).toBeVisible();

        await page.getByRole("link", { name: "Get started" }).click();
        await expect(page).toHaveURL("/onboarding?step=2");
        await page.getByLabel("Timezone").fill("Asia/Karachi");
        await page.getByLabel("Default Library view").selectOption("list");
        await page.getByLabel("Preferred movie language").selectOption("en");
        await Promise.all([
          page.waitForURL("/onboarding?step=3"),
          page.getByRole("button", { name: "Save and continue" }).click(),
        ]);

        await page.reload();
        await expect(page).toHaveURL("/onboarding?step=3");
        await expect(page.getByRole("heading", { level: 1, name: "Build your first library" })).toBeVisible();
        await Promise.all([
          page.waitForURL(/\/dashboard$/),
          page.getByRole("button", { name: "Finish setup" }).click(),
        ]);
        await page.reload();
        await expect(page).toHaveURL(/\/dashboard$/);
        await page.goto("/onboarding");
        await expect(page).toHaveURL(/\/dashboard$/);
        await logout(page);
        await login(page, getQaCredentials("A"));
        await expect(page).toHaveURL(/\/dashboard$/);
      } finally {
        await setOwnOnboardingCompletion("A", new Date().toISOString());
      }
    });

    test("movie search adds Want to Watch and Watched movies before completion", async ({ page }) => {
      test.slow();
      const created: ControlledMovie[] = [];
      await setOwnOnboardingCompletion("A", null);
      try {
        await login(page, getQaCredentials("A"));
        await page.goto("/onboarding?step=3");
        const queries = getOnboardingMovieQueries();

        for (const [index, query] of queries.entries()) {
          const result = await searchOnboardingMovie(page, query);
          await expect(result).toBeVisible();
          const title = (await result.getByRole("heading", { level: 2 }).innerText()).trim();
          const rawTmdbId = await result.getAttribute("data-tmdb-id");
          const tmdbId = Number(rawTmdbId);
          const label = index === 0
            ? `Add ${title} as Want to Watch`
            : `Add ${title} as Watched`;
          const button = result.getByRole("button", { name: label });
          test.skip(!(await button.isVisible().catch(() => false)), `${title} already belongs to this disposable QA library`);
          await clickAndWaitForMutation(page, button, { success: /Added as (?:Want to Watch|Watched)/ });
          created.push({ title, tmdbId, addedByTest: true });
        }

        await Promise.all([
          page.waitForURL(/\/dashboard$/),
          page.getByRole("button", { name: "Finish setup" }).click(),
        ]);
        for (const movie of created) {
          await page.goto(`/library?q=${encodeURIComponent(movie.title)}`);
          await expect(page.getByText(movie.title, { exact: true }).first()).toBeVisible();
        }
      } finally {
        for (const movie of created) await removeControlledMovie(page, movie);
        await setOwnOnboardingCompletion("A", new Date().toISOString());
      }
    });

    test("skip is isolated by user and preserves previously saved preferences", async ({ page }) => {
      await setOwnOnboardingCompletion("A", null);
      await setOwnOnboardingCompletion("B", null);
      try {
        await login(page, getQaCredentials("B"));
        await page.goto("/onboarding?step=2");
        await page.getByLabel("Timezone").fill("Europe/London");
        await page.getByLabel("Default Library view").selectOption("grid");
        await page.getByLabel("Preferred movie language").selectOption("fr");
        await Promise.all([
          page.waitForURL("/onboarding?step=3"),
          page.getByRole("button", { name: "Save and continue" }).click(),
        ]);
        await Promise.all([
          page.waitForURL(/\/dashboard$/),
          page.getByRole("button", { name: "Skip setup" }).click(),
        ]);
        await page.goto("/settings/preferences");
        await expect(page.getByLabel("Default library view")).toHaveValue("grid");
        await expect(page.getByLabel("Preferred TMDB language")).toHaveValue("fr");

        await logout(page);
        await login(page, getQaCredentials("A"));
        await page.goto("/onboarding");
        await expect(page).toHaveURL(/\/onboarding$/);
      } finally {
        await setOwnOnboardingCompletion("A", new Date().toISOString());
        await setOwnOnboardingCompletion("B", new Date().toISOString());
      }
    });

    test("all onboarding steps fit required mobile, tablet, and desktop viewports", async ({ page }) => {
      await setOwnOnboardingCompletion("A", null);
      try {
        await login(page, getQaCredentials("A"));
        for (const viewport of [
          { width: 320, height: 568 },
          { width: 360, height: 640 },
          { width: 375, height: 667 },
          { width: 390, height: 844 },
          { width: 412, height: 915 },
          { width: 768, height: 1024 },
          { width: 820, height: 1180 },
          { width: 1366, height: 768 },
          { width: 1440, height: 900 },
        ]) {
          await page.setViewportSize(viewport);
          for (const step of [1, 2, 3]) {
            await page.goto(`/onboarding?step=${step}`);
            await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
            await expectResponsivePage(page);
            await expectFormsFitViewport(page);
          }
        }
      } finally {
        await setOwnOnboardingCompletion("A", new Date().toISOString());
      }
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declareOnboardingSuite();
} else {
  test.describe.skip(
    `first-time onboarding [guarded: ${authenticatedQaGuard.reason}]`,
    declareOnboardingSuite,
  );
}
