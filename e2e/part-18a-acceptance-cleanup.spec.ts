import { expect, test } from "./fixtures/qa";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import { authenticatedQaGuard } from "./helpers/environment";
import { removeControlledMovie } from "./helpers/movies";

test.use({ trace: "off", video: "off" });

const declaredFixtures = [
  { title: "Inception", tmdbId: 27205 },
  { title: "Arrival", tmdbId: 329865 },
] as const;

function declarePart18aCleanup() {
  test("cleans only the declared Part 18A QA User B fixtures", async ({
    qaUserBPage,
    qaUserBAudit,
  }) => {
    for (const fixture of declaredFixtures) {
      await qaUserBPage.goto(
        `/library?q=${encodeURIComponent(fixture.title)}`,
      );
      const item = qaUserBPage.locator(
        `article[data-tmdb-id="${fixture.tmdbId}"]`,
      );

      if ((await item.count()) > 0) {
        await removeControlledMovie(qaUserBPage, {
          ...fixture,
          addedByTest: true,
        });
      }

      await qaUserBPage.goto(
        `/library?q=${encodeURIComponent(fixture.title)}`,
      );
      await expect(item).toHaveCount(0);
    }

    expectNoUnexpectedBrowserFailures(qaUserBAudit, {
      allowedCategories: ["aborted", "next-image-lcp-advice"],
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declarePart18aCleanup();
} else {
  test.describe.skip(
    `Part 18A QA cleanup [guarded: ${authenticatedQaGuard.reason}]`,
    declarePart18aCleanup,
  );
}
