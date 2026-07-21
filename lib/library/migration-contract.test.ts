import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202607220002_schedule_queue_fixes.sql",
  ),
  "utf8",
).toLowerCase();

describe("schedule and queue migration contract", () => {
  it("adds the missing schedule columns and ownership-only RLS policies", () => {
    expect(migration).toContain("add column if not exists schedule_timezone");
    expect(migration).toContain("add column if not exists schedule_note");
    expect(migration).toContain("for select");
    expect(migration).toContain("for update");
    expect(migration).toContain("using ((select auth.uid()) = user_id)");
    expect(migration).toContain("with check ((select auth.uid()) = user_id)");
  });

  it("defines an authenticated, security-invoker, conflict-safe queue move", () => {
    expect(migration).toContain("function public.move_watch_queue_item");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("for update");
    expect(migration).toContain("set queue_position = null");
    expect(migration).toContain("create unique index if not exists");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
  });
});
