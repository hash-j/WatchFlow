import { expect, test } from "./fixtures/qa";
import { clickAndWaitForMutation } from "./helpers/assertions";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import { authenticatedQaGuard } from "./helpers/environment";

// Real passwords and private discovery/statistics data must never be retained.
test.use({ trace: "off", video: "off" });

function declareBatchThreeBSuite() {
  test.describe("Part 18A Batch 3B browser acceptance", () => {
    test("QA User B can use Picker, Recommendations, and Statistics without stale route data", async ({
      qaUserBPage,
      qaUserBAudit,
    }) => {
      test.slow();

      const pickerResponse = await qaUserBPage.goto("/picker");
      expect(pickerResponse?.status()).toBeLessThan(400);
      await expect(
        qaUserBPage.getByRole("heading", { level: 1, name: "Movie Picker" }),
      ).toBeVisible();

      const librarySummary = qaUserBPage.getByText(/movies? in your library/i);
      await expect(librarySummary).toBeVisible();
      const librarySummaryBefore = await librarySummary.textContent();
      await qaUserBPage
        .getByText("Refine the choice (optional)", { exact: true })
        .click();
      const genre = qaUserBPage.getByLabel("Genre");
      const genreOptions = await genre.locator("option").count();
      if (genreOptions > 1) {
        const value = await genre.locator("option").nth(1).getAttribute("value");
        await genre.selectOption(value ?? "");
        await expect(qaUserBPage).toHaveURL(/genre=/);
        await genre.selectOption("");
      }

      const pickButton = qaUserBPage.getByRole("button", {
        name: "Pick a Movie",
      });
      if (await pickButton.isEnabled()) {
        await clickAndWaitForMutation(qaUserBPage, pickButton, {
          visible: qaUserBPage.getByText(/Picked from|No movies in your library/i),
        });
      }
      await qaUserBPage.reload();
      await expect(librarySummary).toHaveText(librarySummaryBefore ?? "");

      const recommendationsResponse = await qaUserBPage.goto("/recommendations");
      expect(recommendationsResponse?.status()).toBeLessThan(400);
      await expect(
        qaUserBPage.getByRole("heading", {
          level: 1,
          name: "Recommendations",
        }),
      ).toBeVisible();
      await expect(qaUserBPage.locator("main")).toContainText(
        /recommendations from|No suitable recommendations|No unwatched candidates|Add movies to get recommendations/i,
      );
      const refresh = qaUserBPage.getByRole("link", {
        name: "Refresh recommendation presentation",
      });
      if (await refresh.isVisible().catch(() => false)) {
        await refresh.click();
        await expect(qaUserBPage).toHaveURL(/\/recommendations\?refresh=\d+$/, {
          timeout: 30_000,
        });
        await expect(
          qaUserBPage.getByRole("heading", {
            level: 1,
            name: "Recommendations",
          }),
        ).toBeVisible();
      }

      const statisticsResponse = await qaUserBPage.goto("/statistics");
      expect(statisticsResponse?.status()).toBeLessThan(400);
      await expect(
        qaUserBPage.getByRole("heading", { level: 1, name: "Statistics" }),
      ).toBeVisible();
      await expect(qaUserBPage.locator("main")).toContainText(
        /Library summary|No library statistics yet/i,
      );
      await qaUserBPage.reload();
      await expect(
        qaUserBPage.getByRole("heading", { level: 1, name: "Statistics" }),
      ).toBeVisible();

      expectNoUnexpectedBrowserFailures(qaUserBAudit, {
        allowedCategories: ["aborted", "next-image-lcp-advice"],
      });
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declareBatchThreeBSuite();
} else {
  test.describe.skip(
    `Part 18A Batch 3B browser acceptance [guarded: ${authenticatedQaGuard.reason}]`,
    declareBatchThreeBSuite,
  );
}
