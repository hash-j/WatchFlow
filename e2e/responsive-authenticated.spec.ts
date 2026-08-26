import { expect, test } from "./fixtures/qa";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import { authenticatedQaGuard } from "./helpers/environment";
import {
  expectDialogFitsViewport,
  expectFormsFitViewport,
  expectResponsivePage,
} from "./helpers/responsive";

test.use({ trace: "off", video: "off" });

const majorRoutes = [
  "/dashboard",
  "/search",
  "/library",
  "/statistics",
  "/lists",
  "/picker",
  "/recommendations",
  "/import",
  "/watch-next",
  "/schedule",
  "/settings",
  "/settings/profile",
  "/settings/preferences",
  "/settings/notifications",
  "/settings/data",
] as const;

function declareResponsiveAuthenticatedSuite() {
  test.describe("authenticated responsive shell", () => {
    for (const viewport of [
      { width: 320, height: 568, label: "mobile-320" },
      { width: 360, height: 640, label: "mobile-360" },
      { width: 375, height: 667, label: "mobile-375" },
      { width: 390, height: 844, label: "mobile-390" },
      { width: 412, height: 915, label: "mobile-412" },
      { width: 600, height: 960, label: "tablet-600" },
      { width: 768, height: 1024, label: "tablet-768" },
      { width: 820, height: 1180, label: "tablet-820" },
      { width: 1024, height: 768, label: "tablet-1024-landscape" },
      { width: 1366, height: 768, label: "desktop-1366" },
      { width: 1440, height: 900, label: "desktop-1440" },
      { width: 1920, height: 1080, label: "desktop-1920" },
    ]) {
      test(`major routes fit the ${viewport.label} viewport`, async ({
        qaUserAPage,
        qaUserAAudit,
      }) => {
        await qaUserAPage.setViewportSize(viewport);

        for (const route of majorRoutes) {
          const response = await qaUserAPage.goto(route);
          expect(response?.status(), route).toBeLessThan(400);
          await expect(qaUserAPage.getByRole("heading", { level: 1 })).toBeVisible();
          await expectResponsivePage(qaUserAPage);
          await expectFormsFitViewport(qaUserAPage);
        }

        expectNoUnexpectedBrowserFailures(qaUserAAudit);
      });
    }

    for (const viewport of [
      { width: 390, height: 844, label: "mobile" },
      { width: 820, height: 1180, label: "tablet" },
    ]) {
      test(`navigation drawer is keyboard-safe on ${viewport.label}`, async ({
        qaUserAPage,
        qaUserAAudit,
      }) => {
        await qaUserAPage.setViewportSize(viewport);
        await qaUserAPage.goto("/dashboard");

        const trigger = qaUserAPage.getByRole("button", {
          name: "Open main navigation",
        });
        await trigger.focus();
        await trigger.click();
        const drawer = qaUserAPage.getByRole("dialog", {
          name: "Main navigation",
        });
        await expectDialogFitsViewport(qaUserAPage, drawer);
        await expect(
          drawer.getByRole("link", { name: "Library", exact: true }),
        ).toBeVisible();

        await qaUserAPage.keyboard.press("Escape");
        await expect(drawer).not.toBeVisible();
        await expect(trigger).toBeFocused();

        await trigger.click();
        await drawer.getByRole("link", { name: "Library", exact: true }).click();
        await expect(qaUserAPage).toHaveURL(/\/library(?:\?|$)/);
        await expect(drawer).not.toBeVisible();
        expectNoUnexpectedBrowserFailures(qaUserAAudit);
      });
    }

    test("library filters and bulk toolbar fit narrow mobile", async ({
      qaUserAPage,
      qaUserAAudit,
    }) => {
      await qaUserAPage.setViewportSize({ width: 320, height: 568 });
      await qaUserAPage.goto("/library");
      await qaUserAPage
        .locator("details")
        .filter({ hasText: "Filters" })
        .locator("summary")
        .click();
      await expect(qaUserAPage.locator('select[name="status"]')).toBeVisible();
      await expectResponsivePage(qaUserAPage);

      const selectMovies = qaUserAPage.getByRole("button", {
        name: "Select movies",
      });
      if (await selectMovies.isVisible()) {
        await selectMovies.click();
        const firstMovie = qaUserAPage.getByRole("checkbox", {
          name: /^Select (?!all movies on this page)/,
        }).first();
        if (await firstMovie.isVisible()) {
          await firstMovie.check();
          await expect(qaUserAPage.getByText("1 selected on this page")).toBeVisible();
          await expectResponsivePage(qaUserAPage);
        }
      }

      expectNoUnexpectedBrowserFailures(qaUserAAudit);
    });

    test("dialogs and their actions fit the narrow viewport", async ({
      qaUserAPage,
      qaUserAAudit,
    }) => {
      await qaUserAPage.setViewportSize({ width: 320, height: 568 });
      await qaUserAPage.goto("/lists");
      const createTrigger = qaUserAPage.getByRole("button", {
        name: "Create a custom movie list",
      });
      await createTrigger.click();
      const createDialog = qaUserAPage.getByRole("dialog");
      await expectDialogFitsViewport(qaUserAPage, createDialog);
      await expect(createDialog.getByRole("button", { name: "Create List" })).toBeVisible();
      await createDialog.getByRole("button", { name: "Close dialog" }).click();
      await expect(createTrigger).toBeFocused();

      await qaUserAPage.goto("/settings/data");
      const deleteTrigger = qaUserAPage.getByRole("button", {
        name: "Review permanent account deletion",
      });
      await deleteTrigger.click();
      const deleteDialog = qaUserAPage.getByRole("dialog");
      await expectDialogFitsViewport(qaUserAPage, deleteDialog);
      await expect(
        deleteDialog.getByRole("button", { name: "Permanently delete my account" }),
      ).toBeVisible();
      await qaUserAPage.keyboard.press("Escape");
      await expect(deleteTrigger).toBeFocused();
      expectNoUnexpectedBrowserFailures(qaUserAAudit);
    });

    test("owned movie and list detail layouts stay inside mobile viewport", async ({
      qaUserAPage,
      qaUserAAudit,
    }) => {
      await qaUserAPage.setViewportSize({ width: 390, height: 844 });

      await qaUserAPage.goto("/library?view=list");
      const movieHref = await qaUserAPage
        .locator('a[href^="/library/"]')
        .first()
        .getAttribute("href");
      if (movieHref) {
        await qaUserAPage.goto(movieHref);
        await expectResponsivePage(qaUserAPage);
        await expectFormsFitViewport(qaUserAPage);
      }

      await qaUserAPage.goto("/lists");
      const listHref = await qaUserAPage
        .locator('a[href^="/lists/"]')
        .first()
        .getAttribute("href");
      if (listHref) {
        await qaUserAPage.goto(listHref);
        await expectResponsivePage(qaUserAPage);

        const addMoviesTrigger = qaUserAPage.getByRole("button", {
          name: /Add movies to/i,
        });
        if (await addMoviesTrigger.isVisible()) {
          await addMoviesTrigger.click();
          const dialog = qaUserAPage.getByRole("dialog");
          await expectDialogFitsViewport(qaUserAPage, dialog);
          await expect(
            dialog.getByRole("button", { name: /Add Selected Movies/i }),
          ).toBeInViewport();
          await expect(
            dialog.getByRole("button", { name: /Cancel|Done/i }),
          ).toBeInViewport();
          await qaUserAPage.keyboard.press("Escape");
          await expect(addMoviesTrigger).toBeFocused();
          await expect.poll(() => new URL(qaUserAPage.url()).search).toBe("");
          await qaUserAPage.waitForLoadState("networkidle");
        }
      }

      expectNoUnexpectedBrowserFailures(qaUserAAudit);
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declareResponsiveAuthenticatedSuite();
} else {
  test.describe.skip(
    `authenticated responsive shell [guarded: ${authenticatedQaGuard.reason}]`,
    declareResponsiveAuthenticatedSuite,
  );
}
