import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("streamed Server Action browser synchronization", () => {
  it("matches the exact Server Action and uses product state as completion", () => {
    const assertions = source("e2e/helpers/assertions.ts");
    expect(assertions).toContain('headers()["next-action"]');
    expect(assertions).toContain("responseUrl.pathname === targetUrl.pathname");
    expect(assertions).not.toContain("response.finished()");
    expect(assertions).toContain("await expect(outcome.visible).toBeVisible");
  });

  it("refreshes notification feed data only after read action state succeeds", () => {
    const actions = source("app/(app)/actions/notifications.ts");
    const component = source(
      "components/notifications/notification-actions.tsx",
    );
    expect(actions).not.toContain("revalidateNotificationViews");
    expect(component).toContain("useRefreshAfterSuccessfulRead(state)");
    expect(component).toContain('state.status !== "success"');
    expect(component).toContain("router.refresh()");
  });

  it("preserves notification-settings feedback without same-route revalidation", () => {
    const actions = source("app/(app)/settings/actions.ts");
    const notificationAction = actions.slice(
      actions.indexOf("export async function updateNotificationPreferencesAction"),
      actions.indexOf("export async function deleteLibraryDataAction"),
    );
    expect(notificationAction).not.toContain(
      'revalidatePath("/settings/notifications")',
    );
    expect(notificationAction).toContain(
      'message: "Notification preferences saved."',
    );
  });

  it("defers broad notification-layout invalidation until after the response", () => {
    const revalidation = source("lib/revalidation/private-data.ts");
    expect(revalidation).toContain('revalidatePath("/notifications")');
    expect(revalidation).toContain(
      'after(() => revalidatePath("/", "layout"))',
    );
  });

  it("classifies only the proven unused font-preload browser advisory", () => {
    const diagnostics = source("e2e/helpers/diagnostics.ts");
    expect(diagnostics).toContain(
      'normalized.includes("was preloaded using link preload but not used")',
    );
    expect(diagnostics).toContain('normalized.includes(".woff2")');
    expect(diagnostics).toContain('return "unused-font-preload-advice"');
    expect(diagnostics).toContain(
      'failure.category === "unused-font-preload-advice"',
    );
  });
});
