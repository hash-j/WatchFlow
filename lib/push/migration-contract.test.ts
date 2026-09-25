import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609260001_part_18e_push_notification_foundation.sql",
  ),
  "utf8",
).toLowerCase();

describe("Part 18E push notification migration", () => {
  it("adds a disabled-by-default preference and private subscription model", () => {
    expect(migration).toContain(
      "push_notifications_enabled boolean not null default false",
    );
    expect(migration).toContain("create table public.push_subscriptions");
    expect(migration).toContain("references auth.users(id) on delete cascade");
    expect(migration).toContain("endpoint text not null unique");
    expect(migration).toContain("endpoint ~ '^https://'");
    expect(migration).toContain("push_subscriptions_owner_idx");
  });

  it("protects every operation with owner-scoped RLS", () => {
    expect(migration).toContain(
      "alter table public.push_subscriptions enable row level security",
    );
    for (const operation of ["select", "insert", "update", "delete"]) {
      expect(migration).toContain(
        `watchflow_push_subscriptions_${operation}_own`,
      );
    }
    expect(
      migration.match(/user_id = \(select auth\.uid\(\)\)/g)?.length,
    ).toBeGreaterThanOrEqual(5);
    expect(migration).not.toContain("using (true)");
    expect(migration).not.toContain("service_role");
  });

  it("derives ownership inside narrow security-invoker functions", () => {
    expect(migration).toContain("watchflow_save_push_subscription");
    expect(migration).toContain("watchflow_disable_push_notifications");
    expect(migration.match(/security invoker/g)).toHaveLength(2);
    expect(migration.match(/v_user_id uuid := auth\.uid\(\)/g)).toHaveLength(2);
    expect(migration).toContain(
      "where public.push_subscriptions.user_id = v_user_id",
    );
    expect(migration).toContain("where user_id = v_user_id");
    expect(migration).not.toMatch(/p_user_id|current_setting\s*\(/);
  });

  it("keeps delivery infrastructure out of the migration", () => {
    expect(migration).not.toMatch(
      /notification_jobs|notification_deliveries|weekly_summar|email_provider|cron\.|pg_cron|http_post/,
    );
  });
});
