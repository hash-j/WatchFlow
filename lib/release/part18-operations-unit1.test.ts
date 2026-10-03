import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Part 18 operations Unit 1 contracts", () => {
  it("configures the two exact Vercel cron paths independently every minute", () => {
    const config = JSON.parse(source("vercel.json")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    expect(config.crons).toEqual([
      {
        path: "/api/internal/notifications/scheduled-reminders",
        schedule: "* * * * *",
      },
      {
        path: "/api/internal/calendar/sync",
        schedule: "* * * * *",
      },
    ]);
  });

  it("keeps GET and POST on one authenticated, target-pinned route path", () => {
    const routes = [
      source("app/api/internal/notifications/scheduled-reminders/route.ts"),
      source("app/api/internal/calendar/sync/route.ts"),
    ];
    for (const route of routes) {
      expect(route).toContain("isAuthorizedSchedulerRequest");
      expect(route).toContain("isExpectedSchedulerTarget");
      expect(route).toContain("export const GET = execute");
      expect(route).toContain("export const POST = execute");
      expect(route).toContain('"Cache-Control": "no-store"');
      expect(route).not.toMatch(/searchParams|query|stringify\([^)]*secret/i);
    }
  });

  it("keeps scheduler and target configuration out of browser artifacts", () => {
    const scanner = source("scripts/scan-client-secrets.mjs");
    const environment = source(".env.example");
    const target = source("lib/notifications/scheduler-target.ts");
    for (const name of [
      "WATCHFLOW_SCHEDULER_SECRET",
      "WATCHFLOW_EXPECTED_SUPABASE_PROJECT_REF",
      "CRON_SECRET",
    ]) {
      expect(scanner).toContain(`"${name}"`);
      expect(environment).toContain(`${name}=`);
    }
    expect(target).toContain('import "server-only"');
    expect(target).not.toContain("NEXT_PUBLIC_WATCHFLOW");
  });
});
