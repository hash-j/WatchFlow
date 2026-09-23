import { test, expect } from "./fixtures/qa";
import { login, logout } from "./helpers/auth";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import {
  authenticatedQaGuard,
  getQaCredentials,
} from "./helpers/environment";

// Real passwords must never be retained in a trace or video.
test.use({ trace: "off", video: "off" });

function declareBatch3AAcceptance() {
  test.describe("Part 18A Batch 3A request identity acceptance", () => {
    test("QA User B keeps one private identity across protected navigation", async ({
      qaUserBPage,
      qaUserBAudit,
    }) => {
      test.setTimeout(120_000);
      const routes = [
        ["/dashboard", "Dashboard"],
        ["/library", "Library"],
        ["/schedule", "Schedule"],
        ["/settings", "Settings"],
      ] as const;

      for (const [path, heading] of routes) {
        const response = await qaUserBPage.goto(path);
        expect(response?.status(), path).toBeLessThan(400);
        await expect(
          qaUserBPage.getByRole("heading", { level: 1, name: heading }),
        ).toBeVisible();
        await expect(qaUserBPage).toHaveURL(new RegExp(`${path}$`));
      }

      expectNoUnexpectedBrowserFailures(qaUserBAudit, {
        allowedCategories: ["next-image-lcp-advice"],
      });
    });

    test("logout clears QA User B and a fresh login restores only that identity", async ({
      qaUserBPage,
      qaUserBAudit,
    }) => {
      test.setTimeout(180_000);
      await logout(qaUserBPage);
      await qaUserBPage.goto("/dashboard");
      await expect(qaUserBPage).toHaveURL(/\/auth\/login/);
      await qaUserBPage.reload();
      await expect(
        qaUserBPage.getByRole("heading", {
          level: 1,
          name: "Log in to WatchFlow",
        }),
      ).toBeVisible();

      await login(qaUserBPage, getQaCredentials("B"));
      await expect(
        qaUserBPage.getByRole("heading", { level: 1, name: "Dashboard" }),
      ).toBeVisible();
      await logout(qaUserBPage);

      expectNoUnexpectedBrowserFailures(qaUserBAudit, {
        // Logout cancels in-flight RSC refreshes for the protected Dashboard.
        allowedCategories: ["aborted", "next-image-lcp-advice"],
      });
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declareBatch3AAcceptance();
} else {
  test.describe.skip(
    `Part 18A Batch 3A request identity acceptance [guarded: ${authenticatedQaGuard.reason}]`,
    declareBatch3AAcceptance,
  );
}
