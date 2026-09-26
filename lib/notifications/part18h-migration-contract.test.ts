import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202609260002_part_18h_notification_categories.sql",
  ),
  "utf8",
).toLowerCase();

describe("Part 18H notification category migration", () => {
  it("adds four default-on owner preferences", () => {
    for (const column of [
      "notification_movie_status_enabled",
      "notification_watch_next_enabled",
      "notification_custom_lists_enabled",
      "notification_imports_enabled",
    ]) {
      expect(migration).toContain(
        `${column} boolean not null default true`,
      );
    }
  });

  it("grants only the new preference columns and leaves RLS unchanged", () => {
    expect(migration).toContain("grant insert (");
    expect(migration).toContain("grant update (");
    expect(migration).toContain(
      "on table public.user_preferences to authenticated",
    );
    expect(migration).not.toMatch(/create policy|drop policy|disable row level security/);
    expect(migration).not.toMatch(/service_role|security definer/);
  });
});
