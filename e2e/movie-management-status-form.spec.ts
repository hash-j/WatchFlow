import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures/qa";
import { clickAndWaitForMutation } from "./helpers/assertions";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import { authenticatedQaGuard } from "./helpers/environment";
import {
  addControlledMovie,
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

type RequestedStatus = "want_to_watch" | "watch_next" | "scheduled" | "watched";

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

async function openMovie(page: Page, movie: ControlledMovie) {
  await page.goto(`/library?q=${encodeURIComponent(movie.title)}`);
  const item = page.locator(`article[data-tmdb-id="${movie.tmdbId}"]`);
  await expect(item).toBeVisible();
  await item.getByRole("link").first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: movie.title, exact: true }),
  ).toBeVisible();
}

async function expectFields(page: Page, status: RequestedStatus) {
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue(status);
  await expect(page.getByLabel("Review", { exact: true })).toBeVisible();

  const expected = {
    priority: status === "watch_next",
    rating: status === "watched",
    watchedDate: status === "watched",
    schedule: status === "scheduled",
    watchAgain: status === "watched",
  };
  const checks = [
    [page.getByLabel("Priority", { exact: true }), expected.priority],
    [page.getByLabel("Personal rating", { exact: true }), expected.rating],
    [page.getByLabel("Watched date", { exact: true }), expected.watchedDate],
    [page.getByLabel("Date", { exact: true }), expected.schedule],
    [page.getByLabel("Time", { exact: true }), expected.schedule],
    [page.getByLabel("Timezone", { exact: true }), expected.schedule],
    [page.getByLabel("Optional note", { exact: true }), expected.schedule],
    [page.getByLabel("I would watch this movie again"), expected.watchAgain],
  ] as const;

  for (const [locator, visible] of checks) {
    if (visible) await expect(locator).toBeVisible();
    else await expect(locator).toHaveCount(0);
  }
}

async function chooseStatus(page: Page, status: RequestedStatus) {
  await page.getByLabel("Status", { exact: true }).selectOption(status);
  await expectFields(page, status);
}

async function save(page: Page) {
  await clickAndWaitForMutation(
    page,
    page.getByRole("button", { name: "Save changes" }),
    { success: "Movie details saved." },
  );
}

function declareMovieManagementStatusFormSuite() {
  test.describe("Part 18A status-specific movie management acceptance", () => {
    test("renders, transitions, preserves metadata, reflows, and cleans up", async ({
      qaUserBPage,
      qaUserBAudit,
    }) => {
      test.setTimeout(360_000);
      const fixture = await pickAbsentFixture(qaUserBPage);
      test.skip(!fixture, "Every controlled movie already exists for QA User B.");
      const movie = await addControlledMovie(qaUserBPage, fixture!.title);
      test.skip(!movie.addedByTest, `${movie.title} was not a disposable fixture.`);

      try {
        await openMovie(qaUserBPage, movie);
        await expectFields(qaUserBPage, "want_to_watch");
        await expect(
          qaUserBPage
            .getByLabel("Status", { exact: true })
            .locator("option", { hasText: "Currently Watching" }),
        ).toHaveCount(0);
        await qaUserBPage.getByLabel("Review", { exact: true }).fill("Status-form QA review");

        // 1. Saved -> Watch Next.
        await chooseStatus(qaUserBPage, "watch_next");
        await qaUserBPage.getByLabel("Priority", { exact: true }).selectOption("4");
        await save(qaUserBPage);

        // 2. Watch Next -> Saved.
        await chooseStatus(qaUserBPage, "want_to_watch");
        await save(qaUserBPage);

        // 3. Saved -> Scheduled.
        await chooseStatus(qaUserBPage, "scheduled");
        await qaUserBPage.getByLabel("Date", { exact: true }).fill("2099-07-22");
        await qaUserBPage.getByLabel("Time", { exact: true }).fill("19:30");
        await qaUserBPage.getByLabel("Timezone", { exact: true }).fill("Asia/Karachi");
        await save(qaUserBPage);

        // 4. Scheduled -> Saved.
        await chooseStatus(qaUserBPage, "want_to_watch");
        await save(qaUserBPage);

        // 5. Saved -> Watched.
        await chooseStatus(qaUserBPage, "watched");
        await qaUserBPage.getByLabel("Watched date", { exact: true }).fill("2026-09-20");
        await qaUserBPage.getByLabel("Personal rating", { exact: true }).fill("9.1");
        await qaUserBPage.getByLabel("I would watch this movie again").check();
        await save(qaUserBPage);

        // 6. Watched -> Saved, then verify hidden Watched metadata survives.
        await chooseStatus(qaUserBPage, "want_to_watch");
        await save(qaUserBPage);
        await qaUserBPage.reload();
        await expectFields(qaUserBPage, "want_to_watch");
        await chooseStatus(qaUserBPage, "watched");
        await expect(qaUserBPage.getByLabel("Watched date", { exact: true })).toHaveValue("2026-09-20");
        await expect(qaUserBPage.getByLabel("Personal rating", { exact: true })).toHaveValue("9.1");
        await expect(qaUserBPage.getByLabel("I would watch this movie again")).toBeChecked();

        // Prepare and verify 7. Watch Next -> Watched.
        await chooseStatus(qaUserBPage, "watch_next");
        await expect(qaUserBPage.getByLabel("Priority", { exact: true })).toHaveValue("4");
        await save(qaUserBPage);
        await chooseStatus(qaUserBPage, "watched");
        await save(qaUserBPage);

        // Prepare and verify 8. Scheduled -> Watched.
        await chooseStatus(qaUserBPage, "scheduled");
        await qaUserBPage.getByLabel("Date", { exact: true }).fill("2099-07-23");
        await qaUserBPage.getByLabel("Time", { exact: true }).fill("20:00");
        await qaUserBPage.getByLabel("Timezone", { exact: true }).fill("Asia/Karachi");
        await save(qaUserBPage);
        await chooseStatus(qaUserBPage, "watched");
        await save(qaUserBPage);

        // 9. Watched -> Watch Next.
        await chooseStatus(qaUserBPage, "watch_next");
        await expect(qaUserBPage.getByLabel("Priority", { exact: true })).toHaveValue("4");
        await save(qaUserBPage);
        await qaUserBPage.goto("/watch-next");
        await expect(
          qaUserBPage.getByRole("link", { name: movie.title, exact: true }).first(),
        ).toBeVisible();
        await openMovie(qaUserBPage, movie);
        await expectFields(qaUserBPage, "watch_next");
        await expect(qaUserBPage.getByLabel("Review", { exact: true })).toHaveValue("Status-form QA review");

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
            await expectFields(qaUserBPage, "watch_next");
            await expect(qaUserBPage.getByRole("button", { name: "Save changes" })).toBeVisible();
            expect(
              await qaUserBPage.evaluate(
                () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
              ),
            ).toBe(true);
          }
        }

        expectNoUnexpectedBrowserFailures(qaUserBAudit, {
          allowedCategories: ["aborted", "next-image-lcp-advice"],
        });
      } finally {
        await removeControlledMovie(qaUserBPage, movie);
      }
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declareMovieManagementStatusFormSuite();
} else {
  test.describe.skip(
    `Part 18A status-specific movie management acceptance [guarded: ${authenticatedQaGuard.reason}]`,
    declareMovieManagementStatusFormSuite,
  );
}
