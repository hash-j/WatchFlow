import { randomUUID } from "node:crypto";

import { test, expect } from "./fixtures/qa";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import { authenticatedQaGuard } from "./helpers/environment";
import { createQaList, deleteQaList } from "./helpers/lists";

// Real passwords must never be retained in a trace or video.
test.use({ trace: "off", video: "off" });

function declareAuthenticatedIsolationSuite() {
  test.describe("two-user development isolation", () => {
    test("QA User B cannot discover or open QA User A's controlled list", async ({
      qaUserAPage,
      qaUserAAudit,
      qaUserBPage,
      qaUserBAudit,
    }, testInfo) => {
      const name = `pw-isolation-${testInfo.workerIndex}-${randomUUID().slice(0, 8)}`;
      const list = await createQaList(qaUserAPage, name);

      try {
        await qaUserBPage.goto("/lists");
        await expect(
          qaUserBPage.getByRole("heading", { level: 1, name: "My Lists" }),
        ).toBeVisible();
        await expect(
          qaUserBPage.getByText(name, { exact: true }),
        ).toHaveCount(0);

        await qaUserBPage.goto(`/lists/${list.id}`);
        await expect(
          qaUserBPage.getByRole("heading", {
            level: 1,
            name: "List not found",
          }),
        ).toBeVisible();
      } finally {
        await deleteQaList(qaUserAPage, list);
      }

      expectNoUnexpectedBrowserFailures(qaUserAAudit);
      expectNoUnexpectedBrowserFailures(qaUserBAudit, {
        allowedHttpFailures: [
          {
            status: 404,
            urlPattern: /\/lists\/[0-9a-f-]+$/i,
          },
        ],
      });
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declareAuthenticatedIsolationSuite();
} else {
  test.describe.skip(
    `two-user development isolation [guarded: ${authenticatedQaGuard.reason}]`,
    declareAuthenticatedIsolationSuite,
  );
}
