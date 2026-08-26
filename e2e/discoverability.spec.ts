import type { Locator } from "@playwright/test";

import { expect, test } from "./fixtures/qa";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import { authenticatedQaGuard } from "./helpers/environment";
import { expectResponsivePage } from "./helpers/responsive";

test.use({ trace: "off", video: "off" });

const navigationGroups = [
  { name: "Home", items: ["Dashboard"] },
  { name: "Your movies", items: ["Library", "Watch Next", "Schedule", "Lists"] },
  { name: "Discover", items: ["Search", "Movie Picker", "Recommendations"] },
  { name: "Insights", items: ["Statistics"] },
  { name: "Account", items: ["Import Movies", "Settings"] },
] as const;

function assertNavigationGroups(scope: Locator) {
  return Promise.all(
    navigationGroups.map(async (expected) => {
      const group = scope.getByRole("group", { name: expected.name });
      await expect(group).toBeVisible();
      expect(await group.getByRole("link").allTextContents()).toEqual([
        ...expected.items,
      ]);
    }),
  );
}

function declareDiscoverabilitySuite() {
  test.describe("app discoverability", () => {
    test("desktop navigation is grouped, ordered, canonical, and route-aware", async ({
      qaUserAPage,
      qaUserAAudit,
    }) => {
      await qaUserAPage.setViewportSize({ width: 1366, height: 768 });
      await qaUserAPage.goto("/library");
      const navigation = qaUserAPage.getByRole("navigation", {
        name: "Primary navigation",
      });

      await assertNavigationGroups(navigation);
      await expect(
        navigation.getByRole("link", { name: "Library", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(navigation).not.toContainText("My Library");
      await expect(navigation).not.toContainText("My Lists");
      expectNoUnexpectedBrowserFailures(qaUserAAudit);
    });

    test("mobile drawer keeps the same groups and current-route semantics", async ({
      qaUserAPage,
      qaUserAAudit,
    }) => {
      await qaUserAPage.setViewportSize({ width: 390, height: 844 });
      await qaUserAPage.goto("/recommendations");
      await qaUserAPage.getByRole("button", { name: "Open main navigation" }).click();
      const drawer = qaUserAPage.getByRole("dialog", { name: "Main navigation" });

      await assertNavigationGroups(drawer);
      await expect(
        drawer.getByRole("link", { name: "Recommendations", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expectResponsivePage(qaUserAPage);
      expectNoUnexpectedBrowserFailures(qaUserAAudit);
    });

    test("major routes state their purpose and expose a useful next action", async ({
      qaUserAPage,
      qaUserAAudit,
    }) => {
      const routes = [
        ["/dashboard", "Dashboard", /Next actions/i],
        ["/search", "Search", /private Library/i],
        ["/library", "Library", /saved, rated, watched/i],
        ["/watch-next", "Watch Next", /ordered queue/i],
        ["/schedule", "Schedule", /local date and time/i],
        ["/lists", "Lists", /custom collections/i],
        ["/picker", "Movie Picker", /your own Library/i],
        ["/recommendations", "Recommendations", /personal ratings/i],
        ["/statistics", "Statistics", /patterns in your Library/i],
        ["/import", "Import Movies", /CSV file/i],
        ["/settings", "Settings", /profile, preferences/i],
      ] as const;

      for (const [path, heading, purpose] of routes) {
        const response = await qaUserAPage.goto(path);
        expect(response?.status(), path).toBeLessThan(400);
        await expect(
          qaUserAPage.getByRole("heading", { level: 1, name: heading }),
        ).toBeVisible();
        await expect(qaUserAPage.locator("main")).toContainText(purpose);
      }

      expectNoUnexpectedBrowserFailures(qaUserAAudit);
    });

    test("limited-data states explain what to do next without developer copy", async ({
      qaUserBPage,
      qaUserBAudit,
    }) => {
      for (const route of ["/watch-next", "/schedule", "/lists", "/statistics"]) {
        await qaUserBPage.goto(route);
        await expect(qaUserBPage.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(qaUserBPage.locator("main")).not.toContainText(
          /\b(?:RPC|RLS|user_movies|Server Action|database timestamp)\b/i,
        );
      }

      await qaUserBPage.goto("/watch-next");
      if (await qaUserBPage.getByText(/queue is empty/i).isVisible().catch(() => false)) {
        await expect(
          qaUserBPage.getByRole("link", { name: "Browse Library" }),
        ).toHaveAttribute("href", "/library");
      }

      await qaUserBPage.goto("/lists");
      if (await qaUserBPage.getByText(/not created any Lists/i).isVisible().catch(() => false)) {
        await expect(
          qaUserBPage.getByRole("button", { name: "Create a custom movie list" }),
        ).toBeVisible();
      }

      expectNoUnexpectedBrowserFailures(qaUserBAudit);
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declareDiscoverabilitySuite();
} else {
  test.describe.skip(
    `app discoverability [guarded: ${authenticatedQaGuard.reason}]`,
    declareDiscoverabilitySuite,
  );
}
