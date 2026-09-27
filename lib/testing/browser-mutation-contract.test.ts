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

  it("converges notification UI only after read action state succeeds", () => {
    const actions = source("app/(app)/actions/notifications.ts");
    const component = source(
      "components/notifications/notification-actions.tsx",
    );
    const feed = source("components/notifications/notification-feed.tsx");
    const navigation = source("components/app-navigation.tsx");
    expect(actions).not.toContain("revalidateNotificationViews");
    expect(component).toContain("useNotifyAfterSuccessfulRead(");
    expect(component).toContain('state.status !== "success"');
    expect(component).not.toContain("router.refresh()");
    expect(component).toContain("hidden={read}");
    expect(component).toContain("hidden={hideWhenComplete}");
    expect(component).toContain("disabled={isPending || read}");
    expect(component).toContain("disabled={isPending || hideWhenComplete}");
    expect(feed).toContain("setVisibleUnreadCount(nextUnreadCount)");
    expect(feed).toContain("publishUnreadCount(nextUnreadCount)");
    expect(feed).toContain("hideWhenComplete={visibleUnreadCount === 0}");
    expect(feed).toContain("read={!unread}");
    expect(navigation).toContain(
      '"watchflow:notification-unread-count"',
    );
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

  it("defers all notification invalidation until after the response", () => {
    const revalidation = source("lib/revalidation/private-data.ts");
    const notificationHelper = revalidation.slice(
      revalidation.indexOf("export function revalidateNotificationViews"),
      revalidation.indexOf("export function revalidateOnboardingPreferenceViews"),
    );
    expect(notificationHelper).toMatch(
      /after\(\(\) => \{\s*revalidatePath\("\/notifications"\);\s*revalidatePath\("\/", "layout"\);\s*\}\);/,
    );
  });

  it("schedules best-effort push only after the durable notification result", () => {
    const notifications = source(
      "lib/notifications/supabase-notifications.ts",
    );
    expect(notifications).toContain('import { after } from "next/server"');
    expect(notifications).toMatch(
      /function dispatchCreatedNotification[\s\S]*?const delivery = dispatchNotificationEvent\(payload\)\.catch\(\(\) => undefined\);[\s\S]*?after\(\(\) => delivery\)/,
    );
    expect(notifications).not.toContain(
      "await dispatchCreatedNotification(created",
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

  it("allows only an explicitly confirmed completed Server Action abort", () => {
    const diagnostics = source("e2e/helpers/diagnostics.ts");
    const fixtures = source("e2e/fixtures/qa.ts");
    const acceptance = source("e2e/part18c-notifications.spec.ts");

    expect(diagnostics).toContain("confirmCompletedServerAction(");
    expect(diagnostics).toContain('request.method() !== "POST"');
    expect(diagnostics).toContain('request.resourceType() !== "fetch"');
    expect(diagnostics).toContain('request.headers()["next-action"]');
    expect(diagnostics).toContain('includes("text/x-component")');
    expect(diagnostics).toContain("responseUrl.origin !== currentUrl.origin");
    expect(diagnostics).toContain("responseUrl.pathname !== expectedPathname");
    expect(diagnostics).toContain("failure.completedServerAction === true");
    expect(fixtures).toContain('page.waitForLoadState("networkidle")');
    expect(acceptance).toContain(
      'confirmCompletedServerAction(\n      markOneResponse,\n      "/notifications"',
    );
    expect(acceptance).toContain(
      'confirmCompletedServerAction(\n      saveResponse,\n      "/settings/notifications"',
    );
  });
});
