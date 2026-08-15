import { test, expect } from "./fixtures/qa";
import { clickAndWaitForMutation } from "./helpers/assertions";
import { uploadCsvFixture } from "./helpers/csv";
import {
  expectNoUnexpectedBrowserFailures,
} from "./helpers/diagnostics";
import {
  authenticatedQaGuard,
  getTestMovieQuery,
} from "./helpers/environment";
import {
  addControlledMovie,
  removeControlledMovie,
  type ControlledMovie,
} from "./helpers/movies";

// Real passwords must never be retained in a trace or video.
test.use({ trace: "off", video: "off" });

function declareAuthenticatedSmokeSuite() {
  test.describe("authenticated development smoke", () => {
    test("QA User A can reach every implemented critical product route", async ({
      qaUserAPage,
      qaUserAAudit,
    }) => {
      const routes = [
        { path: "/dashboard", heading: /^Welcome/ },
        { path: "/search", heading: "Search Movies" },
        { path: "/library", heading: "My Library" },
        { path: "/watch-next", heading: "Watch Next" },
        { path: "/schedule", heading: "Schedule" },
        { path: "/import", heading: "Import Movies" },
        { path: "/lists", heading: "My Lists" },
        { path: "/picker", heading: "Movie Picker" },
        { path: "/recommendations", heading: "Recommendations" },
        { path: "/statistics", heading: "Statistics" },
        { path: "/settings", heading: "Settings" },
      ] as const;

      for (const route of routes) {
        const response = await qaUserAPage.goto(route.path);
        expect(response?.status(), route.path).toBeLessThan(400);
        await expect(
          qaUserAPage.getByRole("heading", {
            level: 1,
            name: route.heading,
          }),
          route.path,
        ).toBeVisible();
      }

      expectNoUnexpectedBrowserFailures(qaUserAAudit);
    });

    test("a controlled search add is visible and cleaned up only when QA created it", async ({
      qaUserAPage,
      qaUserAAudit,
    }) => {
      test.slow();
      let movie: ControlledMovie | null = null;

      try {
        movie = await addControlledMovie(
          qaUserAPage,
          getTestMovieQuery(),
        );
        await qaUserAPage.goto(
          `/library?q=${encodeURIComponent(movie.title)}`,
        );
        await expect(
          qaUserAPage.getByText(movie.title, { exact: true }).first(),
        ).toBeVisible();
      } finally {
        if (movie?.addedByTest) {
          await removeControlledMovie(qaUserAPage, movie);
        }
      }

      expectNoUnexpectedBrowserFailures(qaUserAAudit, {
        // Successful add/remove Server Action redirects may cancel their POST
        // fetch after the asserted destination has committed.
        allowedCategories: ["aborted"],
      });
    });

    test("the CSV helper uploads an in-memory fixture without importing rows", async ({
      qaUserAPage,
      qaUserAAudit,
    }) => {
      await qaUserAPage.goto("/import");
      await uploadCsvFixture(qaUserAPage.getByLabel("CSV file"), [
        {
          Title: "Arrival",
          Year: 2016,
          Review: "Controlled QA row, never confirmed",
        },
      ]);

      await clickAndWaitForMutation(
        qaUserAPage,
        qaUserAPage.getByRole("button", { name: "Upload and inspect" }),
        {
          visible: qaUserAPage.getByText("Map columns", { exact: true }),
        },
      );
      await expect(
        qaUserAPage.getByText(
          "Nothing is saved until you review the matches and confirm.",
        ),
      ).toBeVisible();

      expectNoUnexpectedBrowserFailures(qaUserAAudit);
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declareAuthenticatedSmokeSuite();
} else {
  test.describe.skip(
    `authenticated development smoke [guarded: ${authenticatedQaGuard.reason}]`,
    declareAuthenticatedSmokeSuite,
  );
}
