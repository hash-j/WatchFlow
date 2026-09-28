import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Part 18I server boundary", () => {
  it("keeps credentials in server-only modules and uses only scoped RPCs", () => {
    const background = read("lib/supabase/background.ts");
    const executor = read("lib/notifications/scheduled-reminders.ts");
    expect(background).toMatch(/^import "server-only";/);
    expect(executor).toMatch(/^import "server-only";/);
    expect(executor).not.toContain(".from(");
    expect(executor).toContain("watchflow_claim_scheduled_reminders");
    expect(executor).toContain("watchflow_finalize_scheduled_reminder");
  });

  it("protects the internal route with a separate scheduler secret", () => {
    const route = read("app/api/internal/notifications/scheduled-reminders/route.ts");
    const auth = read("lib/notifications/scheduler-auth.ts");
    expect(route).toContain("isAuthorizedSchedulerRequest");
    expect(route).toContain("status: 401");
    expect(auth).toContain("WATCHFLOW_SCHEDULER_SECRET");
    expect(auth).toContain("timingSafeEqual");
    expect(auth).not.toContain("SUPABASE_SECRET_KEY");
  });

  it("does not import the executor into browser components", () => {
    const settings = read("components/settings/notification-settings-form.tsx");
    expect(settings).not.toContain("scheduled-reminders");
    expect(settings).not.toContain("SUPABASE_SECRET_KEY");
    expect(settings).not.toContain("WATCHFLOW_SCHEDULER_SECRET");
  });

  it("adds the scheduler credential to the built-client secret scan", () => {
    const scanner = read("scripts/scan-client-secrets.mjs");
    expect(scanner).toContain('"WATCHFLOW_SCHEDULER_SECRET"');
  });
});
