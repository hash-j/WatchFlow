import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures/qa";
import { clickAndWaitForMutation } from "./helpers/assertions";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import {
  authenticatedQaGuard,
  getOnboardingMovieQueries,
} from "./helpers/environment";
import {
  addControlledMovie,
  type ControlledMovie,
} from "./helpers/movies";

test.use({ trace: "off", video: "off" });

async function queueSnapshot(page: Page) {
  const rows = page.locator("ol > li");
  const items: Array<{ title: string; position: number }> = [];

  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    const title = (
      await row.locator("a[href^='/library/']").first().innerText()
    ).trim();
    const match = (await row.innerText()).match(/Position\s+(\d+)/);
    if (!match) throw new Error(`Queue position is missing for ${title}.`);
    items.push({ title, position: Number(match[1]) });
  }

  return items;
}

function expectValidQueue(
  snapshot: Array<{ title: string; position: number }>,
) {
  const positions = snapshot.map((item) => item.position);
  expect(new Set(positions).size).toBe(positions.length);
  expect(positions).toEqual(
    Array.from({ length: positions.length }, (_, index) => index + 1),
  );
}

async function setMovieStatus(
  page: Page,
  movie: ControlledMovie,
  status: "watch_next" | "want_to_watch",
) {
  await page.goto(`/library?q=${encodeURIComponent(movie.title)}`);
  const item = page.locator(`article[data-tmdb-id="${movie.tmdbId}"]`);
  await expect(item).toBeVisible();
  await item.getByRole("link").first().click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: movie.title,
      exact: true,
    }),
  ).toBeVisible();
  await page.locator('select[name="status"]:visible').selectOption(status);
  await clickAndWaitForMutation(
    page,
    page.getByRole("button", { name: "Save changes" }),
    { success: "Movie details saved." },
  );
}

async function removeBatchTwoMovie(page: Page, movie: ControlledMovie) {
  if (!movie.addedByTest) return;

  await page.goto(`/library?q=${encodeURIComponent(movie.title)}`);
  const item = page.locator(`article[data-tmdb-id="${movie.tmdbId}"]`);
  if ((await item.count()) === 0) return;

  await item.getByRole("link").first().click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: movie.title,
      exact: true,
    }),
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
      .or(page.getByRole("heading", { level: 1, name: "Movie not found" })),
  ).toBeVisible();
}

function declarePerformanceBatchTwoQa() {
  test.describe("Part 18A Batch 2 browser QA", () => {
    test("queue additions, reorder, removal, persistence, and unrelated data", async ({
      qaUserBPage,
      qaUserBAudit,
    }) => {
      test.setTimeout(240_000);
      const controlledMovies: ControlledMovie[] = [];

      await qaUserBPage.goto("/watch-next");
      const unrelatedQueueBefore = await queueSnapshot(qaUserBPage);
      expectValidQueue(unrelatedQueueBefore);

      try {
        for (const query of getOnboardingMovieQueries()) {
          const movie = await addControlledMovie(qaUserBPage, query);
          controlledMovies.push(movie);
          test.skip(
            !movie.addedByTest,
            `The controlled movie ${movie.title} already existed, so QA will not mutate it.`,
          );
          await setMovieStatus(qaUserBPage, movie, "watch_next");
        }

        const [firstMovie, secondMovie] = controlledMovies;
        await qaUserBPage.goto("/watch-next");
        await expect(
          qaUserBPage.getByRole("heading", { level: 1, name: "Watch Next" }),
        ).toBeVisible();

        let queue = await queueSnapshot(qaUserBPage);
        expectValidQueue(queue);
        let titles = queue.map((item) => item.title);
        expect(titles.indexOf(firstMovie.title)).toBeGreaterThanOrEqual(0);
        expect(titles.indexOf(secondMovie.title)).toBe(
          titles.indexOf(firstMovie.title) + 1,
        );

        const secondQueueItem = qaUserBPage
          .locator("ol > li")
          .filter({ has: qaUserBPage.getByRole("link", { name: secondMovie.title, exact: true }) });
        await clickAndWaitForMutation(
          qaUserBPage,
          secondQueueItem.getByRole("button", { name: "Move movie earlier in the queue" }),
          { success: "Queue order updated." },
        );

        queue = await queueSnapshot(qaUserBPage);
        expectValidQueue(queue);
        titles = queue.map((item) => item.title);
        expect(titles.indexOf(secondMovie.title)).toBe(
          titles.indexOf(firstMovie.title) - 1,
        );

        await qaUserBPage.reload();
        queue = await queueSnapshot(qaUserBPage);
        expectValidQueue(queue);
        titles = queue.map((item) => item.title);
        expect(titles.indexOf(secondMovie.title)).toBe(
          titles.indexOf(firstMovie.title) - 1,
        );

        await removeBatchTwoMovie(qaUserBPage, firstMovie);
        firstMovie.addedByTest = false;
        await qaUserBPage.goto("/watch-next");
        queue = await queueSnapshot(qaUserBPage);
        expectValidQueue(queue);
        await expect(
          qaUserBPage.getByRole("link", { name: firstMovie.title, exact: true }),
        ).toHaveCount(0);
        await expect(
          qaUserBPage.getByRole("link", { name: secondMovie.title, exact: true }),
        ).toBeVisible();

        await setMovieStatus(qaUserBPage, secondMovie, "want_to_watch");
        await qaUserBPage.goto("/watch-next");
        queue = await queueSnapshot(qaUserBPage);
        expectValidQueue(queue);
        await expect(
          qaUserBPage.getByRole("link", {
            name: secondMovie.title,
            exact: true,
          }),
        ).toHaveCount(0);
        expect(queue).toEqual(unrelatedQueueBefore);

        await removeBatchTwoMovie(qaUserBPage, secondMovie);
        secondMovie.addedByTest = false;
        await qaUserBPage.goto("/watch-next");
        expect(await queueSnapshot(qaUserBPage)).toEqual(unrelatedQueueBefore);
      } finally {
        for (const movie of [...controlledMovies].reverse()) {
          await removeBatchTwoMovie(qaUserBPage, movie);
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
  declarePerformanceBatchTwoQa();
} else {
  test.describe.skip(
    `Part 18A Batch 2 browser QA [guarded: ${authenticatedQaGuard.reason}]`,
    declarePerformanceBatchTwoQa,
  );
}
