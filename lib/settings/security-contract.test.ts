import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("settings security boundaries", () => {
  it("keeps the admin factory and account deletion adapter server-only", () => {
    expect(source("lib/supabase/admin.ts")).toContain('import "server-only"');
    expect(source("lib/settings/data-controls.ts")).toContain(
      'import "server-only"',
    );
    expect(source("components/settings/data-controls.tsx")).not.toContain(
      "createAdminClient",
    );
  });

  it("does not accept a browser user ID in any settings action", () => {
    const actions = source("app/(app)/settings/actions.ts");
    expect(actions).not.toContain('formData.get("userId")');
    expect(actions).not.toContain('formData.get("user_id")');
    expect(actions).toContain("session.user.id");
  });

  it("deletes library relationships, never shared movie metadata", () => {
    const controls = source("lib/settings/data-controls.ts");
    expect(controls).toContain('.from("user_movies")');
    expect(controls).not.toContain('.from("movies").delete');
    expect(controls).toContain("admin.auth.admin.deleteUser(user.id)");
  });

  it("distinguishes the active system feed from deferred delivery channels", () => {
    const page = source("app/(app)/settings/notifications/page.tsx");
    expect(page).toContain("in-app system notifications are available now");
    expect(page).toContain("Browser push");
    expect(page).toContain("automated push delivery");
    expect(page).toMatch(/are not\s+currently sent/);
  });

  it("uses private no-store attachment responses for both exports", () => {
    for (const route of [
      "app/(app)/settings/data/export/csv/route.ts",
      "app/(app)/settings/data/export/json/route.ts",
    ]) {
      const contents = source(route);
      expect(contents).toContain("Content-Disposition");
      expect(contents).toContain("private, no-store");
      expect(contents).toContain("authenticateSettings()");
    }
  });
});
