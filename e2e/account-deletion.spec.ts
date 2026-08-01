import { randomUUID } from "node:crypto";

import { test, expect } from "./fixtures/qa";
import { clickAndWaitForMutation } from "./helpers/assertions";
import { expectLoginRejected } from "./helpers/auth";
import {
  attachBrowserAudit,
  expectNoUnexpectedBrowserFailures,
  monitorBrowserFailures,
} from "./helpers/diagnostics";
import {
  accountDeletionQaGuard,
  getQaCredentials,
  getTestMovieQuery,
} from "./helpers/environment";
import { createQaList, deleteQaList } from "./helpers/lists";
import {
  addControlledMovie,
  removeControlledMovie,
  type ControlledMovie,
} from "./helpers/movies";

// This suite is one-shot; real passwords must never enter a trace or video.
test.use({ trace: "off", video: "off" });

function declareAccountDeletionSuite() {
  test.describe("disposable development account deletion", () => {
    test("deletes only the dedicated account and leaves QA User A signed in", async ({
      browser,
      deleteAccountPage,
      deleteAccountAudit,
      qaUserAPage,
      qaUserAAudit,
    }, testInfo) => {
      let disposableMovie: ControlledMovie | null = null;
      let qaUserAMovie: ControlledMovie | null = null;
      const controlledList = await createQaList(
        deleteAccountPage,
        `pw-delete-${randomUUID().slice(0, 8)}`,
      );
      let deletionCompleted = false;

      try {
        [disposableMovie, qaUserAMovie] = await Promise.all([
          addControlledMovie(deleteAccountPage, getTestMovieQuery()),
          addControlledMovie(qaUserAPage, getTestMovieQuery()),
        ]);

        await deleteAccountPage.goto("/settings/preferences");
        await deleteAccountPage
          .getByLabel("Default priority")
          .selectOption("5");
        await clickAndWaitForMutation(
          deleteAccountPage,
          deleteAccountPage.getByRole("button", {
            name: "Save preferences",
          }),
          { success: "Application preferences saved." },
        );

        await deleteAccountPage.goto("/settings/data");
        await deleteAccountPage
          .getByLabel(/Type DELETE to confirm/i)
          .fill("DELETE");
        await deleteAccountPage
          .getByLabel(
            "I understand this action is permanent and cannot be undone.",
          )
          .check();

        await clickAndWaitForMutation(
          deleteAccountPage,
          deleteAccountPage.getByRole("button", {
            name: "Permanently delete my account",
          }),
          {
            url: /\/\?accountDeleted=1$/,
            success: "Your WatchFlow account has been deleted.",
          },
        );
        deletionCompleted = true;

        await deleteAccountPage.goto("/dashboard");
        await expect(deleteAccountPage).toHaveURL("/auth/login");

        await qaUserAPage.goto("/dashboard");
        await expect(
          qaUserAPage.getByRole("heading", {
            level: 1,
            name: /^Welcome/,
          }),
        ).toBeVisible();
        await qaUserAPage.goto(
          `/library?q=${encodeURIComponent(qaUserAMovie.title)}`,
        );
        await expect(
          qaUserAPage
            .getByText(qaUserAMovie.title, { exact: true })
            .first(),
        ).toBeVisible();

        const rejectedContext = await browser.newContext({
          baseURL: testInfo.project.use.baseURL,
          storageState: undefined,
        });
        const rejectedPage = await rejectedContext.newPage();
        const rejectedAudit = monitorBrowserFailures(rejectedPage);
        try {
          await expectLoginRejected(
            rejectedPage,
            getQaCredentials("delete"),
          );
          expectNoUnexpectedBrowserFailures(rejectedAudit, {
            allowedHttpFailures: [
              {
                status: 400,
                urlPattern: /\/auth\/v1\/token$/i,
              },
            ],
          });
        } finally {
          rejectedAudit.stop();
          await attachBrowserAudit(
            testInfo,
            "deleted-account-login",
            rejectedAudit,
          );
          await rejectedContext.close();
        }
      } finally {
        if (!deletionCompleted) {
          await deleteQaList(deleteAccountPage, controlledList);
          if (disposableMovie?.addedByTest) {
            await removeControlledMovie(deleteAccountPage, disposableMovie);
          }
        }
        if (qaUserAMovie?.addedByTest) {
          await removeControlledMovie(qaUserAPage, qaUserAMovie);
        }
      }

      expectNoUnexpectedBrowserFailures(deleteAccountAudit);
      expectNoUnexpectedBrowserFailures(qaUserAAudit);
    });
  });
}

if (accountDeletionQaGuard.enabled) {
  declareAccountDeletionSuite();
} else {
  test.describe.skip(
    `disposable development account deletion [guarded: ${accountDeletionQaGuard.reason}]`,
    declareAccountDeletionSuite,
  );
}
