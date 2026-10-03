import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const reminderPath =
  "/api/internal/notifications/scheduled-reminders";
const calendarPath = "/api/internal/calendar/sync";
const fixedOrigin = "https://watchflow-dev-ops.vercel.app";

const workflows = {
  reminder: source(
    ".github/workflows/watchflow-dev-reminder-scheduler.yml",
  ),
  calendar: source(
    ".github/workflows/watchflow-dev-calendar-scheduler.yml",
  ),
};

describe("Part 18 operations Unit 2A contracts", () => {
  it("preserves the intended Vercel cron contract and supplies a cron-free dev config", () => {
    const productionConfig = JSON.parse(source("vercel.json")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const developmentConfig = JSON.parse(
      source("vercel.watchflow-dev.json"),
    ) as Record<string, unknown>;

    expect(productionConfig.crons).toEqual([
      { path: reminderPath, schedule: "* * * * *" },
      { path: calendarPath, schedule: "* * * * *" },
    ]);
    expect(developmentConfig).toEqual({
      $schema: "https://openapi.vercel.sh/vercel.json",
    });
    expect(developmentConfig).not.toHaveProperty("crons");
  });

  it("uses only the fixed non-Production origin and independent exact routes", () => {
    expect(workflows.reminder).toContain(`'${fixedOrigin}${reminderPath}'`);
    expect(workflows.reminder).not.toContain(calendarPath);
    expect(workflows.calendar).toContain(`'${fixedOrigin}${calendarPath}'`);
    expect(workflows.calendar).not.toContain(reminderPath);

    for (const workflow of Object.values(workflows)) {
      expect(workflow.match(/https:\/\//g)).toHaveLength(1);
      expect(workflow).not.toMatch(/inputs\.(?:url|origin|route|path)/i);
      expect(workflow).not.toMatch(/watchflow-movies|\.supabase\.co/i);
      expect(workflow).not.toContain("ckwadpmvxieekjlsfcks");
      expect(workflow).not.toContain("${{ secrets.WATCHFLOW_DEV_SUPABASE");
    }
  });

  it("uses GET bearer authentication without query-string or logging exposure", () => {
    for (const workflow of Object.values(workflows)) {
      expect(workflow).toContain("--request GET");
      expect(workflow).not.toMatch(/--request POST|\bcurl\s+.*-X\s*POST/i);
      expect(workflow).toContain(
        "WATCHFLOW_DEV_SCHEDULER_SECRET: ${{ secrets.WATCHFLOW_DEV_SCHEDULER_SECRET }}",
      );
      expect(workflow).toContain(
        'Authorization: Bearer ${WATCHFLOW_DEV_SCHEDULER_SECRET}',
      );
      expect(workflow).not.toMatch(/https:\/\/[^'\s]+\?[^'\s]*/);
      expect(workflow).not.toMatch(/(?:echo|printf|console\.log).*SCHEDULER_SECRET/i);
      expect(workflow).not.toMatch(/set\s+-[^\n]*x/);
      expect(workflow).toContain("--max-redirs 0");
      expect(workflow).not.toContain("--location");
      expect(workflow).toContain("--connect-timeout 10");
      expect(workflow).toContain("--max-time 55");
    }
  });

  it("keeps permissions, environment, confirmation, and schedule gates fail closed", () => {
    const cases = [
      {
        workflow: workflows.reminder,
        gate: "WATCHFLOW_DEV_REMINDER_SCHEDULER_ENABLED",
        cron: 'cron: "2-57/5 * * * *"',
      },
      {
        workflow: workflows.calendar,
        gate: "WATCHFLOW_DEV_CALENDAR_SCHEDULER_ENABLED",
        cron: 'cron: "4-59/5 * * * *"',
      },
    ];

    for (const { workflow, gate, cron } of cases) {
      expect(workflow).toContain("permissions: {}");
      expect(workflow).toContain("environment: watchflow-dev-scheduler");
      expect(workflow).toContain("workflow_dispatch:");
      expect(workflow).toMatch(
        /confirm_watchflow_dev:\s+[\s\S]*?required: true[\s\S]*?default: false[\s\S]*?type: boolean/,
      );
      expect(workflow).toContain(
        `github.event_name == 'schedule' && vars.${gate} == 'true'`,
      );
      expect(workflow).toContain(
        "github.event_name == 'workflow_dispatch' && inputs.confirm_watchflow_dev == true",
      );
      expect(workflow).toContain("cancel-in-progress: false");
      expect(workflow).toContain(cron);
    }

    expect(workflows.reminder).toContain(
      "group: watchflow-dev-reminder-scheduler",
    );
    expect(workflows.calendar).toContain(
      "group: watchflow-dev-calendar-scheduler",
    );
  });

  it("accepts only exact nonnegative aggregate response schemas", () => {
    for (const key of [
      "claimedJobs",
      "attemptedDeliveries",
      "delivered",
      "retryable",
      "failed",
    ]) {
      expect(workflows.reminder).toContain(`"${key}"`);
    }
    for (const key of [
      "claimed",
      "succeeded",
      "retryable",
      "failed",
      "authRequired",
      "staleFinalizations",
    ]) {
      expect(workflows.calendar).toContain(`"${key}"`);
    }
    for (const workflow of Object.values(workflows)) {
      expect(workflow).toContain('status !== "200"');
      expect(workflow).toContain("unexpected redirect");
      expect(workflow).toContain('value.trim() === "no-store"');
      expect(workflow).toContain("Object.keys(payload).sort()");
      expect(workflow).toContain("Number.isInteger(payload[key])");
      expect(workflow).toContain("payload[key] >= 0");
      expect(workflow.indexOf("if (!exactSchema)")).toBeLessThan(
        workflow.indexOf("JSON.stringify(payload)"),
      );
    }
  });

  it("registers the GitHub scheduler credential with the client-secret scanner", () => {
    expect(source("scripts/scan-client-secrets.mjs")).toContain(
      '"WATCHFLOW_DEV_SCHEDULER_SECRET"',
    );
  });
});
