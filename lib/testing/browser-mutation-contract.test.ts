import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("streamed Server Action browser synchronization", () => {
  it("waits for the complete action response before navigating or auditing", () => {
    const assertions = source("e2e/helpers/assertions.ts");
    expect(assertions).toContain("await response.finished()");
    expect(assertions).toContain(
      "The streamed Server Action response should finish without being aborted.",
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
