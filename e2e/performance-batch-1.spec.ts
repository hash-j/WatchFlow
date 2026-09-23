import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures/qa";
import { clickAndWaitForMutation } from "./helpers/assertions";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import {
  authenticatedQaGuard,
  getTestMovieQuery,
} from "./helpers/environment";
import {
  addControlledMovie,
  type ControlledMovie,
} from "./helpers/movies";

test.use({ trace: "off", video: "off" });

function futureDateInput() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

async function removeBatchOneMovie(page: Page, movie: ControlledMovie) {
  await page.goto(`/library?q=${encodeURIComponent(movie.title)}`);
  const item = page.locator(`article[data-tmdb-id="${movie.tmdbId}"]`);
  await expect(item).toBeVisible();
  await item.getByRole("link").first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: movie.title, exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1_000);
  await page
    .locator(
      `button[aria-label="Remove ${movie.title} from your library"]:visible`,
    )
    .click();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).origin === new URL(page.url()).origin,
  );
  await page.getByRole("button", { name: "Yes, remove" }).click();
  expect((await responsePromise).status()).toBeLessThan(500);
  await expect(
    page
      .getByRole("heading", { level: 1, name: "Library" })
      .or(page.getByRole("heading", { level: 2, name: "Movie not found" })),
  ).toBeVisible();
}

function declarePerformanceBatchOneQa() {
  test.describe("Part 18A Batch 1 browser QA", () => {
    test("Dashboard, Library, and Schedule load through normal navigation", async ({
      qaUserBPage,
      qaUserBAudit,
    }) => {
      for (const [path, heading] of [
        ["/dashboard", "Dashboard"],
        ["/library", "Library"],
        ["/schedule", "Schedule"],
      ] as const) {
        const response = await qaUserBPage.goto(path);
        expect(response?.status(), path).toBeLessThan(400);
        await expect(
          qaUserBPage.getByRole("heading", { level: 1, name: heading }),
        ).toBeVisible();
      }

      expectNoUnexpectedBrowserFailures(qaUserBAudit, {
        allowedConsoleFailures: [
          {
            category: "browser-runtime",
            locationPattern: /\/_next\/static\/chunks\//,
          },
        ],
      });
    });

    test("a newly controlled movie can be scheduled and then cleaned up", async ({
      qaUserBPage,
      qaUserBAudit,
    }) => {
      test.slow();
      let movie: ControlledMovie | null = null;

      try {
        movie = await addControlledMovie(qaUserBPage, getTestMovieQuery());
        test.skip(
          !movie.addedByTest,
          "The controlled movie already existed, so QA will not mutate it.",
        );

        await qaUserBPage.goto("/schedule");
        await expect(
          qaUserBPage.getByLabel("Movie", { exact: true }).locator("option", {
            hasText: movie.title,
          }),
        ).toHaveCount(1);
        await qaUserBPage
          .getByLabel("Movie", { exact: true })
          .selectOption({ label: movie.title });
        await qaUserBPage.getByLabel("Date", { exact: true }).fill(futureDateInput());
        await qaUserBPage.getByLabel("Time", { exact: true }).fill("19:00");

        await clickAndWaitForMutation(
          qaUserBPage,
          qaUserBPage.getByRole("button", { name: "Save schedule" }),
          { success: "Movie scheduled." },
        );

        await qaUserBPage.reload();
        await expect(
          qaUserBPage.getByRole("link", { name: movie.title, exact: true }),
        ).toBeVisible();
      } finally {
        if (movie?.addedByTest) {
          await removeBatchOneMovie(qaUserBPage, movie);
        }
      }

      expectNoUnexpectedBrowserFailures(qaUserBAudit, {
        allowedCategories: ["aborted", "next-image-lcp-advice"],
        allowedConsoleFailures: [
          {
            category: "browser-runtime",
            locationPattern: /\/_next\/static\/chunks\//,
          },
        ],
      });
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declarePerformanceBatchOneQa();
} else {
  test.describe.skip(
    `Part 18A Batch 1 browser QA [guarded: ${authenticatedQaGuard.reason}]`,
    declarePerformanceBatchOneQa,
  );
}
