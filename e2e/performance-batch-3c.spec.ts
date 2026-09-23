import { expect, type Page } from "@playwright/test";

import { test } from "./fixtures/qa";
import { clickAndWaitForMutation } from "./helpers/assertions";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import {
  authenticatedQaGuard,
  getTestMovieQuery,
} from "./helpers/environment";
import { createQaList, deleteQaList } from "./helpers/lists";
import {
  addControlledMovie,
  removeControlledMovie,
  type ControlledMovie,
} from "./helpers/movies";

test.use({ trace: "off", video: "off" });

function count(value: string) {
  const normalized = value.replaceAll(",", "").trim();
  expect(normalized).toMatch(/^\d+$/);
  return Number(normalized);
}

async function dashboardLibraryCount(page: Page) {
  await page.goto("/dashboard");
  const text = await page.getByText(/movies? in your Library/i).innerText();
  const match = /([\d,]+) movies? in your Library/i.exec(text);
  if (!match) throw new Error("Dashboard Library count is unavailable.");
  return count(match[1]);
}

async function statistic(page: Page, testId: string) {
  await page.goto("/statistics");
  return count(await page.getByTestId(testId).innerText());
}

async function openMovie(page: Page, movie: ControlledMovie) {
  await page.goto(`/library?q=${encodeURIComponent(movie.title)}`);
  const item = page.locator(`article[data-tmdb-id="${movie.tmdbId}"]`);
  await expect(item).toBeVisible();
  await item.getByRole("link").first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: movie.title, exact: true }),
  ).toBeVisible();
  return page.url();
}

function declareBatchThreeCSuite() {
  test.describe("Part 18A Batch 3C cache and revalidation acceptance", () => {
    test("mutations remain fresh across Library, Dashboard, Statistics, and Lists", async ({
      qaUserBPage,
      qaUserBAudit,
    }) => {
      test.setTimeout(240_000);
      const listName = `Batch 3C QA ${Date.now()}`;
      let movie: ControlledMovie | null = null;
      let list: { id: string; name: string } | null = null;

      const dashboardBefore = await dashboardLibraryCount(qaUserBPage);
      const totalBefore = await statistic(
        qaUserBPage,
        "stat-total-movies",
      );
      const watchedBefore = await statistic(
        qaUserBPage,
        "stat-watched-movies",
      );
      const favouritesBefore = await statistic(
        qaUserBPage,
        "stat-favourite-movies",
      );

      try {
        movie = await addControlledMovie(qaUserBPage, getTestMovieQuery());
        test.skip(
          !movie.addedByTest,
          "The controlled movie already existed, so Batch 3C will not mutate it.",
        );

        expect(await dashboardLibraryCount(qaUserBPage)).toBe(
          dashboardBefore + 1,
        );
        expect(await statistic(qaUserBPage, "stat-total-movies")).toBe(
          totalBefore + 1,
        );

        const movieUrl = await openMovie(qaUserBPage, movie);
        await qaUserBPage
          .locator('select[name="status"]:visible')
          .selectOption("watched");
        await qaUserBPage
          .getByLabel("Watched date", { exact: true })
          .fill(new Date().toISOString().slice(0, 10));
        await qaUserBPage
          .getByLabel("Personal rating", { exact: true })
          .fill("9.4");
        await clickAndWaitForMutation(
          qaUserBPage,
          qaUserBPage.getByRole("button", { name: "Save changes" }),
          { success: "Movie details saved." },
        );
        await clickAndWaitForMutation(
          qaUserBPage,
          qaUserBPage.getByRole("button", {
            name: `Add ${movie.title} to favourites`,
          }),
          { success: "Added to favourites." },
        );
        await expect(
          qaUserBPage.getByRole("button", {
            name: `Remove ${movie.title} from favourites`,
          }),
        ).toBeVisible();

        expect(await statistic(qaUserBPage, "stat-watched-movies")).toBe(
          watchedBefore + 1,
        );
        expect(await statistic(qaUserBPage, "stat-favourite-movies")).toBe(
          favouritesBefore + 1,
        );
        await qaUserBPage.goto("/dashboard");
        await expect(
          qaUserBPage
            .getByRole("link", { name: movie.title, exact: true })
            .first(),
        ).toBeVisible();

        list = await createQaList(qaUserBPage, listName);
        await qaUserBPage.goto(movieUrl);
        await qaUserBPage
          .getByLabel(`Add ${movie.title} to ${list.name}`)
          .check();
        await clickAndWaitForMutation(
          qaUserBPage,
          qaUserBPage.getByRole("button", { name: "Save List Memberships" }),
          { success: /List memberships saved: 1 added, 0 removed/ },
        );
        await qaUserBPage.goto(`/lists/${list.id}`);
        await expect(
          qaUserBPage.getByRole("link", { name: movie.title, exact: true }),
        ).toBeVisible();

        await qaUserBPage.goto(movieUrl);
        await qaUserBPage
          .getByLabel(`Remove ${movie.title} from ${list.name}`)
          .uncheck();
        await clickAndWaitForMutation(
          qaUserBPage,
          qaUserBPage.getByRole("button", { name: "Save List Memberships" }),
          { success: /List memberships saved: 0 added, 1 removed/ },
        );
        await qaUserBPage.goto(`/lists/${list.id}`);
        await expect(
          qaUserBPage.getByRole("link", { name: movie.title, exact: true }),
        ).toHaveCount(0);
      } finally {
        if (list) {
          await deleteQaList(qaUserBPage, list);
        }
        if (movie?.addedByTest) {
          await removeControlledMovie(qaUserBPage, movie);
          movie.addedByTest = false;
        }
      }

      expect(await dashboardLibraryCount(qaUserBPage)).toBe(dashboardBefore);
      expect(await statistic(qaUserBPage, "stat-total-movies")).toBe(
        totalBefore,
      );
      expectNoUnexpectedBrowserFailures(qaUserBAudit, {
        allowedCategories: ["aborted"],
      });
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declareBatchThreeCSuite();
} else {
  test.describe.skip(
    `Part 18A Batch 3C acceptance [guarded: ${authenticatedQaGuard.reason}]`,
    declareBatchThreeCSuite,
  );
}
