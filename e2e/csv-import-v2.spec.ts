import { expect, type Page } from "@playwright/test";

import { test } from "./fixtures/qa";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import { authenticatedQaGuard } from "./helpers/environment";
import { removeControlledMovie, type ControlledMovie } from "./helpers/movies";
import { uploadCsvFixture, type CsvFixtureRow } from "./helpers/csv";

test.use({ trace: "off", video: "off" });

const candidates = [
  { title: "Inception", tmdbId: 27205, year: 2010 },
  { title: "Arrival", tmdbId: 329865, year: 2016 },
  { title: "Interstellar", tmdbId: 157336, year: 2014 },
  { title: "The Matrix", tmdbId: 603, year: 1999 },
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

async function uploadAndPreview(page: Page, rows: readonly CsvFixtureRow[]) {
  await page.goto("/import");
  await uploadCsvFixture(page.getByLabel("CSV file"), rows, "csv-import-v2-qa.csv");
  await page.getByRole("button", { name: "Upload and inspect" }).click();
  await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
  await page.getByRole("button", { name: "Preview rows" }).click();
  await expect(
    page.getByRole("heading", { name: "Preview and validate" }),
  ).toBeVisible();
}

async function matchAndConfirm(page: Page) {
  await page.getByRole("button", { name: "Match with TMDB" }).click();
  await expect(page.getByRole("heading", { name: "Review matches" })).toBeVisible({
    timeout: 120_000,
  });
  await page.getByRole("button", { name: "Review import summary" }).click();
  await expect(page.getByRole("heading", { name: "Confirm import" })).toBeVisible();
  await page.getByRole("button", { name: /Confirm import|Retry remaining rows/ }).click();
  await expect(page.getByRole("heading", { name: "Import complete" })).toBeVisible({
    timeout: 180_000,
  });
}

function declareCsvImportV2Suite() {
  test.describe("Part 18A CSV Import V2 acceptance", () => {
    test("chunks 100+ rows, updates existing metadata, and cleans up", async ({
      qaUserBPage,
      qaUserBAudit,
    }) => {
      test.setTimeout(360_000);
      const fixture = await pickAbsentFixture(qaUserBPage);
      test.skip(!fixture, "Every controlled CSV fixture already exists in QA User B's Library.");
      const movie: ControlledMovie = {
        title: fixture!.title,
        tmdbId: fixture!.tmdbId,
        addedByTest: false,
      };

      try {
        const largeRows = Array.from({ length: 105 }, () => ({
          Title: fixture!.title,
          "Release Year": fixture!.year,
          "TMDB ID": fixture!.tmdbId,
          Status: "Watch Next",
          "Personal Rating": "8.8",
          Priority: "3",
          Review: "CSV Import V2 large-workflow fixture",
          Favourite: "Yes",
          "Would Watch Again": "Yes",
        }));
        await uploadAndPreview(qaUserBPage, largeRows);
        await matchAndConfirm(qaUserBPage);
        movie.addedByTest = true;
        await expect(qaUserBPage.getByText("105", { exact: true }).first()).toBeVisible();
        await expect(qaUserBPage.locator("dt", { hasText: /^Added$/ }).locator("..")).toContainText("1");
        await expect(qaUserBPage.locator("dt", { hasText: /^Skipped$/ }).locator("..")).toContainText("104");
        await expect(qaUserBPage.getByRole("status")).toContainText(
          "Processed 105 / 105",
        );
        await qaUserBPage.goto("/watch-next");
        await expect(
          qaUserBPage.getByRole("link", { name: fixture!.title, exact: true }).first(),
        ).toBeVisible();

        const smallRows = [
          {
            Title: fixture!.title,
            "Release Year": fixture!.year,
            "TMDB ID": fixture!.tmdbId,
            Status: "Watched",
            "Watched Date": "2026-09-20",
            "Personal Rating": "9.1",
            Priority: "4",
            Review: "CSV Import V2 existing metadata update",
            Favourite: "No",
            "Would Watch Again": "Yes",
          },
          {
            Title: "Broken Import Row",
            "Release Year": "not-a-year",
            "TMDB ID": "",
            Status: "Watched",
            "Watched Date": "",
            "Personal Rating": "",
            Priority: "",
            Review: "",
            Favourite: "No",
            "Would Watch Again": "No",
          },
        ];
        await uploadAndPreview(qaUserBPage, smallRows);
        await matchAndConfirm(qaUserBPage);
        await expect(qaUserBPage.locator("dt", { hasText: /^Updated$/ }).locator("..")).toContainText("1");
        await expect(qaUserBPage.locator("dt", { hasText: /^Invalid$/ }).locator("..")).toContainText("1");
        await expect(
          qaUserBPage.getByText(/Release year must be a four-digit year/),
        ).toBeVisible();

        await qaUserBPage.goto(`/library?q=${encodeURIComponent(fixture!.title)}`);
        const item = qaUserBPage.locator(`article[data-tmdb-id="${fixture!.tmdbId}"]`);
        await expect(item).toHaveCount(1);
        await item.getByRole("link").first().click();
        await expect(qaUserBPage.locator('select[name="status"]:visible')).toHaveValue("watched");
        await expect(qaUserBPage.getByLabel("Watched date", { exact: true })).toHaveValue(
          "2026-09-20",
        );
        await expect(qaUserBPage.getByLabel("Personal rating", { exact: true })).toHaveValue(
          "9.1",
        );
        await expect(qaUserBPage.getByLabel("Priority", { exact: true })).toHaveCount(0);
        await expect(qaUserBPage.getByLabel("Review", { exact: true })).toHaveValue(
          "CSV Import V2 existing metadata update",
        );
        await expect(
          qaUserBPage.getByLabel("I would watch this movie again"),
        ).toBeChecked();

        await qaUserBPage.locator('select[name="status"]:visible').selectOption("watch_next");
        await expect(qaUserBPage.getByLabel("Priority", { exact: true })).toHaveValue("4");
        await expect(qaUserBPage.getByLabel("Personal rating", { exact: true })).toHaveCount(0);
        await qaUserBPage.locator('select[name="status"]:visible').selectOption("watched");
        await expect(
          qaUserBPage.getByRole("button", {
            name: `Add ${fixture!.title} to favourites`,
          }),
        ).toBeVisible();

        await qaUserBPage.reload();
        await expect(qaUserBPage.locator('select[name="status"]:visible')).toHaveValue("watched");
        await qaUserBPage.goto("/watch-next");
        await expect(
          qaUserBPage.getByRole("link", { name: fixture!.title, exact: true }),
        ).toHaveCount(0);
        expectNoUnexpectedBrowserFailures(qaUserBAudit, {
          allowedCategories: ["aborted", "next-image-lcp-advice"],
        });
      } finally {
        if (movie.addedByTest) {
          await removeControlledMovie(qaUserBPage, movie);
          movie.addedByTest = false;
        }
      }
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declareCsvImportV2Suite();
} else {
  test.describe.skip(
    `Part 18A CSV Import V2 acceptance [guarded: ${authenticatedQaGuard.reason}]`,
    declareCsvImportV2Suite,
  );
}
