import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202609250001_part_18c_notification_foundation.sql",
);
const migration = readFileSync(migrationPath, "utf8").toLowerCase();

describe("Part 18C-1 notification migration", () => {
  it("creates only the private in-app system notification foundation", () => {
    expect(migration).toContain("create table public.notifications");
    expect(migration).toContain("type in ('system')");
    expect(migration).toContain("references auth.users(id) on delete cascade");
    expect(migration).toContain("notifications_feed_idx");
    expect(migration).toContain("notifications_unread_idx");
    expect(migration).not.toMatch(/email|weekly_summary|push_notification/);
    expect(migration).not.toMatch(/create table public\.notification_deliveries/);
  });

  it("keeps reads and read-state updates owner scoped under RLS", () => {
    expect(migration).toContain(
      "alter table public.notifications enable row level security",
    );
    expect(migration).toContain("watchflow_notifications_select_own");
    expect(migration).toContain("watchflow_notifications_update_read_state_own");
    expect(migration.match(/user_id = \(select auth\.uid\(\)\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain(
      "grant update (read_at) on table public.notifications to authenticated",
    );
    expect(migration).not.toMatch(/grant insert[^;]*authenticated/);
    expect(migration).not.toMatch(/grant delete[^;]*authenticated/);
  });

  it("derives mutation ownership in narrow security-invoker RPCs", () => {
    expect(migration).toContain("watchflow_mark_notification_read");
    expect(migration).toContain("watchflow_mark_all_notifications_read");
    expect(migration.match(/security invoker/g)).toHaveLength(2);
    expect(migration.match(/set search_path = ''/g)).toHaveLength(2);
    expect(migration).toContain("where id = p_notification_id");
    expect(migration).toContain("and user_id = v_user_id");
    expect(migration).toContain("where user_id = v_user_id");
    expect(migration).toContain(
      "revoke all on function public.watchflow_mark_notification_read(uuid)",
    );
    expect(migration).toContain(
      "grant execute on function public.watchflow_mark_all_notifications_read()",
    );
  });

  it("accepts only internal action paths and object metadata", () => {
    expect(migration).toContain("left(action_path, 1) = '/'");
    expect(migration).toContain("left(action_path, 2) <> '//'");
    expect(migration).toContain("jsonb_typeof(metadata) = 'object'");
    expect(migration).toContain("pg_column_size(metadata) <= 8192");
  });
});
