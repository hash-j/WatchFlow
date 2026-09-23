import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures/qa";
import { clickAndWaitForMutation } from "./helpers/assertions";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import { authenticatedQaGuard } from "./helpers/environment";
import {
  removeControlledMovie,
  type ControlledMovie,
} from "./helpers/movies";

test.use({ trace: "off", video: "off" });

const candidates = [
  { title: "Inception", tmdbId: 27205 },
  { title: "Arrival", tmdbId: 329865 },
  { title: "Interstellar", tmdbId: 157336 },
  { title: "The Matrix", tmdbId: 603 },
] as const;

async function pickAbsentFixture(page: Page) {
  for (const candidate of candidates) {
    await page.goto(`/library?q=${encodeURIComponent(candidate.title)}`);
    if (
      (await page.locator(`article[data-tmdb-id="${candidate.tmdbId}"]`).count()) === 0
    ) {
      return candidate;
    }
  }
  return null;
}

async function search(page: Page, query: string) {
  await page.goto("/search");
  await page.getByPlaceholder("Search by movie title").fill(query);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/search" && url.searchParams.has("q")),
    page.getByRole("button", { name: "Search", exact: true }).click(),
  ]);
}

function resultFor(page: Page, tmdbId: number) {
  return page.locator(`article[data-tmdb-id="${tmdbId}"]`);
}

function declareSearchMembershipSuite() {
  test.describe("Part 18A Search already-in-Library acceptance", () => {
    test("marks only owned movies, refreshes after add, and restores addability after removal", async ({
      qaUserBPage,
      qaUserBAudit,
    }) => {
      test.setTimeout(240_000);
      const fixture = await pickAbsentFixture(qaUserBPage);
      test.skip(!fixture, "Every controlled Search fixture already exists for QA User B.");
      let movie: ControlledMovie | null = null;

      try {
        await search(qaUserBPage, fixture!.title);
        const result = resultFor(qaUserBPage, fixture!.tmdbId);
        await expect(result).toBeVisible();
        const addButton = result.getByRole("button", { name: "Add to Library" });
        await expect(addButton).toBeEnabled();

        await clickAndWaitForMutation(qaUserBPage, addButton, {
          success: "Added to your library.",
        });
        movie = {
          title: (await result.getByRole("heading", { level: 2 }).innerText()).trim(),
          tmdbId: fixture!.tmdbId,
          addedByTest: true,
        };

        const immediateOwnedButton = result.getByRole("button", {
          name: "Already in your Library",
        });
        await expect(immediateOwnedButton).toBeDisabled();
        await expect(result.getByRole("status")).toContainText("Added to your library.");
        await expect(result.getByRole("button", { name: "Add to Library" })).toHaveCount(0);

        await qaUserBPage.reload();
        await expect(resultFor(qaUserBPage, fixture!.tmdbId)).toBeVisible();
        await expect(
          resultFor(qaUserBPage, fixture!.tmdbId).getByRole("button", {
            name: "Already in your Library",
          }),
        ).toBeDisabled();
        await expect(
          resultFor(qaUserBPage, fixture!.tmdbId).getByText(
            "This movie is already in your private Library.",
          ),
        ).toBeVisible();

        for (const theme of ["light", "dark"] as const) {
          await qaUserBPage.evaluate((value) => window.localStorage.setItem("theme", value), theme);
          await qaUserBPage.reload();
          await expect(qaUserBPage.locator("html")).toHaveClass(new RegExp(`(^| )${theme}( |$)`));
          for (const viewport of [
            { width: 390, height: 844 },
            { width: 820, height: 1180 },
            { width: 1366, height: 768 },
          ]) {
            await qaUserBPage.setViewportSize(viewport);
            await expect(
              resultFor(qaUserBPage, fixture!.tmdbId).getByRole("button", {
                name: "Already in your Library",
              }),
            ).toBeVisible();
            expect(
              await qaUserBPage.evaluate(
                () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
              ),
            ).toBe(true);
          }
        }

        await removeControlledMovie(qaUserBPage, movie);
        movie.addedByTest = false;
        await search(qaUserBPage, fixture!.title);
        await expect(resultFor(qaUserBPage, fixture!.tmdbId)).toBeVisible();
        await expect(
          resultFor(qaUserBPage, fixture!.tmdbId).getByRole("button", {
            name: "Add to Library",
          }),
        ).toBeEnabled();
        await expect(
          resultFor(qaUserBPage, fixture!.tmdbId).getByRole("button", {
            name: "Already in your Library",
          }),
        ).toHaveCount(0);

        expectNoUnexpectedBrowserFailures(qaUserBAudit, {
          allowedCategories: ["aborted", "next-image-lcp-advice"],
        });
      } finally {
        if (movie?.addedByTest) {
          await removeControlledMovie(qaUserBPage, movie);
        }
      }
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declareSearchMembershipSuite();
} else {
  test.describe.skip(
    `Part 18A Search already-in-Library acceptance [guarded: ${authenticatedQaGuard.reason}]`,
    declareSearchMembershipSuite,
  );
}
