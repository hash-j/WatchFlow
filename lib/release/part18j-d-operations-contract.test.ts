import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Part 18J-D background executor operations contract", () => {
  it("keeps reminder and calendar invocations separate and strongly authenticated", () => {
    const reminder = source(
      "app/api/internal/notifications/scheduled-reminders/route.ts",
    );
    const calendar = source("app/api/internal/calendar/sync/route.ts");
    const auth = source("lib/notifications/scheduler-auth.ts");

    for (const route of [reminder, calendar]) {
      expect(route).toContain("isAuthorizedSchedulerRequest");
      expect(route).toContain('"Cache-Control": "no-store"');
      expect(route).not.toContain("SUPABASE_SECRET_KEY");
      expect(route).not.toContain("WATCHFLOW_SCHEDULER_SECRET");
    }
    expect(auth).toContain("MINIMUM_SCHEDULER_SECRET_LENGTH = 32");
    expect(auth).toContain("timingSafeEqual");
  });

  it("documents an explicit non-Production external scheduler contract", () => {
    const operations = source("docs/BACKGROUND_EXECUTORS.md");
    expect(operations).toContain(
      "POST /api/internal/notifications/scheduled-reminders",
    );
    expect(operations).toContain("POST /api/internal/calendar/sync");
    expect(operations).toMatch(/two independent HTTP\s+jobs/);
    expect(operations).toContain("ckwadpmvxieekjlsfcks");
    expect(operations).toContain(
      "Production activation requires a separate explicit release approval",
    );
  });

  it("keeps executor output aggregate-only and credential-free", () => {
    const reminder = source("lib/notifications/scheduled-reminders.ts");
    const calendar = source("lib/calendar/calendar-sync-executor.ts");
    expect(reminder).toContain("ScheduledReminderExecutionResult");
    expect(calendar).toContain("CalendarSyncExecutionResult");
    for (const executor of [reminder, calendar]) {
      expect(executor).not.toMatch(/console\.(log|warn|error)/);
    }
  });
});
