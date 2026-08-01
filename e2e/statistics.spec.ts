import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/qa";
import { clickAndWaitForMutation } from "./helpers/assertions";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import { authenticatedQaGuard } from "./helpers/environment";

// Real passwords and private statistics must never be retained in a trace or video.
test.use({ trace: "off", video: "off" });

const COUNT_METRIC_IDS = [
  "stat-total-movies",
  "stat-watched-movies",
  "stat-unwatched-movies",
  "stat-watch-next-movies",
  "stat-favourite-movies",
  "stat-scheduled-movies",
  "stat-watched-this-month",
  "stat-watched-this-year",
] as const;

const ALL_METRIC_IDS = [
  ...COUNT_METRIC_IDS,
  "stat-average-rating",
  "stat-watched-runtime",
] as const;

const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
] as const;

function parseCount(value: string) {
  const normalized = value.replaceAll(",", "").trim();
  expect(normalized).toMatch(/^\d+$/);
  return Number(normalized);
}

async function hasVisibleText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).isVisible().catch(() => false);
}

async function openStatistics(page: Page) {
  const response = await page.goto("/statistics");
  expect(response?.status()).toBeLessThan(400);
  await expect(
    page.getByRole("heading", { level: 1, name: "Statistics" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Statistics", exact: true }),
  ).toHaveAttribute("aria-current", "page");
}

async function metricSnapshot(page: Page) {
  return Promise.all(
    ALL_METRIC_IDS.map(async (testId) => ({
      testId,
      value: (await page.getByTestId(testId).innerText()).trim(),
    })),
  );
}

function statisticsSection(page: Page, heading: string) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { level: 2, name: heading, exact: true }),
  });
}

async function savePersonalRating(page: Page, rating: string) {
  await page.getByLabel("Personal rating", { exact: true }).fill(rating);
  await clickAndWaitForMutation(
    page,
    page.getByRole("button", { name: "Save changes" }),
    { success: "Movie details saved." },
  );
}

function declareStatisticsSuite() {
  test.describe("personal viewing statistics", () => {
    test("QA User A sees a real protected route with consistent summary and status totals", async ({
      qaUserAPage,
      qaUserAAudit,
    }) => {
      await openStatistics(qaUserAPage);

      if (await hasVisibleText(qaUserAPage, "No library statistics yet")) {
        expectNoUnexpectedBrowserFailures(qaUserAAudit);
        test.skip(
          true,
          "QA User A has an empty library, so populated metric assertions are unavailable.",
        );
      }

      for (const testId of ALL_METRIC_IDS) {
        await expect(qaUserAPage.getByTestId(testId)).toBeVisible();
        await expect(qaUserAPage.getByTestId(testId)).not.toHaveText("");
      }

      const counts = Object.fromEntries(
        await Promise.all(
          COUNT_METRIC_IDS.map(async (testId) => [
            testId,
            parseCount(await qaUserAPage.getByTestId(testId).innerText()),
          ]),
        ),
      ) as Record<(typeof COUNT_METRIC_IDS)[number], number>;

      const statusSection = statisticsSection(
        qaUserAPage,
        "Status distribution",
      );
      await expect(statusSection).toBeVisible();
      const analyzedText = await statusSection.locator("p").first().innerText();
      const analyzedMatch = /across ([\d,]+) analyzed library/i.exec(analyzedText);
      expect(analyzedMatch).not.toBeNull();
      const analyzedMovies = parseCount(analyzedMatch![1]);

      expect(
        counts["stat-watched-movies"] + counts["stat-unwatched-movies"],
      ).toBe(analyzedMovies);
      expect(counts["stat-watch-next-movies"]).toBeLessThanOrEqual(
        analyzedMovies,
      );
      expect(counts["stat-favourite-movies"]).toBeLessThanOrEqual(
        analyzedMovies,
      );
      expect(counts["stat-scheduled-movies"]).toBeLessThanOrEqual(
        analyzedMovies,
      );

      const statusCounts = await statusSection.locator("li").evaluateAll(
        (items) =>
          items.map((item) => {
            const value = item.querySelectorAll("span")[1]?.textContent ?? "";
            const match = /^\s*([\d,]+)/.exec(value);
            return match ? Number(match[1].replaceAll(",", "")) : -1;
          }),
      );
      expect(statusCounts).not.toContain(-1);
      expect(statusCounts.reduce((total, count) => total + count, 0)).toBe(
        analyzedMovies,
      );

      await expect(qaUserAPage.getByTestId("stat-average-rating")).toHaveText(
        /^(?:\u2014|\d+(?:\.\d)?\/10)$/,
      );
      await expect(qaUserAPage.getByTestId("stat-watched-runtime")).toHaveText(
        /^(?:\u2014|\d+h(?: \d+m)?|\d+m)$/,
      );
      await expect(qaUserAPage.locator("body")).not.toContainText(
        /PGRST\d{3}|relation .* does not exist|stack trace/i,
      );

      expectNoUnexpectedBrowserFailures(qaUserAAudit);
    });

    test("distributions and available movie activity expose text values and working detail links", async ({
      qaUserAPage,
      qaUserAAudit,
    }) => {
      await openStatistics(qaUserAPage);

      if (await hasVisibleText(qaUserAPage, "No library statistics yet")) {
        expectNoUnexpectedBrowserFailures(qaUserAAudit);
        test.skip(
          true,
          "QA User A has an empty library, so distribution assertions are unavailable.",
        );
      }

      const statusSection = statisticsSection(
        qaUserAPage,
        "Status distribution",
      );
      const genreSection = statisticsSection(
        qaUserAPage,
        "Most common genres in your library",
      );
      const ratingSection = statisticsSection(
        qaUserAPage,
        "Personal rating distribution",
      );

      await expect(statusSection.locator("li").first()).toBeVisible();
      await expect(genreSection).toBeVisible();
      if ((await genreSection.locator("li").count()) > 0) {
        await expect(genreSection.locator("li").first()).toContainText(/\d/);
      } else {
        await expect(genreSection).toContainText(
          "Genre metadata is unavailable for the movies in your library.",
        );
      }

      await expect(ratingSection).toBeVisible();
      if ((await ratingSection.locator("li").count()) > 0) {
        await expect(ratingSection.locator("li")).toHaveCount(5);
      } else {
        await expect(ratingSection).toContainText(
          "Rate watched movies to see your rating distribution.",
        );
      }

      if (await hasVisibleText(qaUserAPage, "No watched movies yet")) {
        expectNoUnexpectedBrowserFailures(qaUserAAudit);
        test.skip(
          true,
          "QA User A has no watched movies, so timeline and movie activity links are unavailable.",
        );
      }

      const timelineSection = statisticsSection(
        qaUserAPage,
        "Watched over time",
      );
      await expect(timelineSection.locator("li")).toHaveCount(12);

      const movieSections = qaUserAPage.locator("section").filter({
        has: qaUserAPage.getByRole("heading", {
          level: 2,
          name: /^(?:Top-rated watched movies|Recently watched)$/,
        }),
      });
      const movieLink = movieSections.getByRole("link").first();
      if ((await movieLink.count()) === 0) {
        expectNoUnexpectedBrowserFailures(qaUserAAudit);
        test.skip(
          true,
          "QA User A has watched movies but no rated or dated movie available for a Statistics detail link.",
        );
      }

      await Promise.all([
        qaUserAPage.waitForURL((url) =>
          /^\/library\/[a-zA-Z0-9-]+$/.test(url.pathname),
        ),
        movieLink.click(),
      ]);
      await expect(
        qaUserAPage.getByRole("heading", { level: 1 }),
      ).toBeVisible();

      expectNoUnexpectedBrowserFailures(qaUserAAudit);
    });

    test("a reversible QA User A rating update revalidates Statistics without changing QA User B", async ({
      qaUserAPage,
      qaUserAAudit,
      qaUserBPage,
      qaUserBAudit,
    }) => {
      await openStatistics(qaUserAPage);
      await openStatistics(qaUserBPage);

      if (
        (await hasVisibleText(qaUserAPage, "No library statistics yet")) ||
        (await hasVisibleText(qaUserBPage, "No library statistics yet"))
      ) {
        expectNoUnexpectedBrowserFailures(qaUserAAudit);
        expectNoUnexpectedBrowserFailures(qaUserBAudit);
        test.skip(
          true,
          "Both populated QA libraries are required for reversible revalidation and isolation coverage.",
        );
      }

      const userBMetricsBefore = await metricSnapshot(qaUserBPage);
      const recentSection = statisticsSection(qaUserAPage, "Recently watched");
      const recentLink = recentSection.getByRole("link").first();

      if ((await recentLink.count()) === 0) {
        expectNoUnexpectedBrowserFailures(qaUserAAudit);
        expectNoUnexpectedBrowserFailures(qaUserBAudit);
        test.skip(
          true,
          "QA User A has no recently watched record suitable for a reversible rating update.",
        );
      }

      const movieHref = await recentLink.getAttribute("href");
      expect(movieHref).toMatch(/^\/library\/[a-zA-Z0-9-]+$/);

      let mutationApplied = false;
      let originalRating = "";
      const replacementRatingHolder = { value: "" };

      try {
        await qaUserAPage.goto(movieHref!);
        const ratingInput = qaUserAPage.getByLabel("Personal rating", {
          exact: true,
        });
        originalRating = await ratingInput.inputValue();
        replacementRatingHolder.value =
          Number(originalRating) === 10 ? "9.9" : "10";

        await savePersonalRating(qaUserAPage, replacementRatingHolder.value);
        mutationApplied = true;

        await openStatistics(qaUserAPage);
        const updatedRecentLink = statisticsSection(
          qaUserAPage,
          "Recently watched",
        ).locator(`a[href="${movieHref}"]`);
        await expect(updatedRecentLink).toContainText(
          `Your rating: ${replacementRatingHolder.value}/10`,
        );

        await openStatistics(qaUserBPage);
        expect(await metricSnapshot(qaUserBPage)).toEqual(userBMetricsBefore);
      } finally {
        if (mutationApplied) {
          await qaUserAPage.goto(movieHref!);
          await savePersonalRating(qaUserAPage, originalRating);
        }
      }

      expectNoUnexpectedBrowserFailures(qaUserAAudit);
      expectNoUnexpectedBrowserFailures(qaUserBAudit);
    });

    test("the empty-library state is verified when a configured QA account is empty", async ({
      qaUserAPage,
      qaUserAAudit,
      qaUserBPage,
      qaUserBAudit,
    }) => {
      await openStatistics(qaUserAPage);
      await openStatistics(qaUserBPage);

      const candidates = [qaUserAPage, qaUserBPage];
      const emptyPage = (
        await Promise.all(
          candidates.map(async (page) => ({
            page,
            empty: await hasVisibleText(page, "No library statistics yet"),
          })),
        )
      ).find((candidate) => candidate.empty)?.page;

      if (!emptyPage) {
        expectNoUnexpectedBrowserFailures(qaUserAAudit);
        expectNoUnexpectedBrowserFailures(qaUserBAudit);
        test.skip(
          true,
          "No configured empty-library QA account is available.",
        );
        return;
      }

      await expect(
        emptyPage.getByText(
          "Add movies to your library to begin building viewing statistics.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        emptyPage.getByRole("link", { name: "Search Movies" }),
      ).toBeVisible();
      await expect(
        emptyPage.getByRole("link", { name: "Import Movies" }),
      ).toBeVisible();

      expectNoUnexpectedBrowserFailures(qaUserAAudit);
      expectNoUnexpectedBrowserFailures(qaUserBAudit);
    });

    test("the no-watched state is verified when configured QA data supports it", async ({
      qaUserAPage,
      qaUserAAudit,
      qaUserBPage,
      qaUserBAudit,
    }) => {
      await openStatistics(qaUserAPage);
      await openStatistics(qaUserBPage);

      const candidates = [qaUserAPage, qaUserBPage];
      const noWatchedPage = (
        await Promise.all(
          candidates.map(async (page) => ({
            page,
            noWatched: await hasVisibleText(page, "No watched movies yet"),
          })),
        )
      ).find((candidate) => candidate.noWatched)?.page;

      if (!noWatchedPage) {
        expectNoUnexpectedBrowserFailures(qaUserAAudit);
        expectNoUnexpectedBrowserFailures(qaUserBAudit);
        test.skip(
          true,
          "No configured non-empty QA library without watched movies is available.",
        );
        return;
      }

      await expect(
        noWatchedPage.getByText(
          "Mark movies as watched to unlock viewing activity statistics.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        noWatchedPage.getByRole("link", { name: "Open Library" }).first(),
      ).toBeVisible();
      await expect(
        noWatchedPage.getByRole("link", { name: "Open Watch Next" }),
      ).toBeVisible();

      expectNoUnexpectedBrowserFailures(qaUserAAudit);
      expectNoUnexpectedBrowserFailures(qaUserBAudit);
    });

    for (const viewport of VIEWPORTS) {
      test(`Statistics fits ${viewport.width}x${viewport.height}`, async ({
        qaUserAPage,
        qaUserAAudit,
      }) => {
        await qaUserAPage.setViewportSize(viewport);
        await openStatistics(qaUserAPage);

        const measurements = await qaUserAPage.evaluate(() => {
          const primaryNavigationLink = document.querySelector(
            'a[href="/statistics"]',
          );
          const measuredElements = [
            ...document.querySelectorAll('[data-testid^="stat-"]'),
            ...document.querySelectorAll("main section"),
          ].filter((element): element is Element => element !== null);

          return {
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            elementsFit: measuredElements.every((element) => {
              const box = element.getBoundingClientRect();
              return box.left >= -1 && box.right <= window.innerWidth + 1;
            }),
            navigationTargetHeight:
              primaryNavigationLink?.getBoundingClientRect().height ?? 0,
          };
        });

        expect(measurements.documentWidth).toBeLessThanOrEqual(
          measurements.viewportWidth,
        );
        expect(measurements.elementsFit).toBe(true);
        expect(measurements.navigationTargetHeight).toBeGreaterThanOrEqual(44);

        expectNoUnexpectedBrowserFailures(qaUserAAudit);
      });
    }
  });
}

if (authenticatedQaGuard.enabled) {
  declareStatisticsSuite();
} else {
  test.describe.skip(
    `personal viewing statistics [guarded: ${authenticatedQaGuard.reason}]`,
    declareStatisticsSuite,
  );
}
