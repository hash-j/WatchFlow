import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = resolve(
  process.cwd(),
  "supabase/migrations/202607220003_user_settings.sql",
);
const migration = readFileSync(path, "utf8").toLowerCase();
const privilegesPatch = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202607230001_user_preferences_privileges.sql",
  ),
  "utf8",
).toLowerCase();

describe("Part 10B database migration contract", () => {
  it("adds the profile country and private preference schema", () => {
    expect(migration).toContain("add column if not exists country text");
    expect(migration).toContain("create table if not exists public.user_preferences");
    expect(migration).toContain("references auth.users(id) on delete cascade");
    expect(migration).toContain("show_adult_results boolean not null default false");
    expect(migration).toContain("movies_per_page in (12, 24, 48, 96)");
  });

  it("creates ownership-only select, insert, and update RLS without delete", () => {
    expect(migration).toContain("alter table public.user_preferences enable row level security");
    expect(migration).toContain("for select");
    expect(migration).toContain("for insert");
    expect(migration).toContain("for update");
    expect(migration).toContain("using ((select auth.uid()) = user_id)");
    expect(migration).toContain("with check ((select auth.uid()) = user_id)");
    expect(migration).not.toContain("for delete\n  to authenticated");
    expect(migration).not.toContain("using (true)");
  });

  it("restricts mutable profile columns and preference audit fields", () => {
    expect(migration).toContain(
      "grant update (full_name, avatar_url, country, timezone)",
    );
    expect(migration).not.toContain(
      "grant update (id, subscription_plan, created_at, updated_at)",
    );
  });

  it("supplements profile onboarding and backfills without overwriting", () => {
    expect(migration).toContain("watchflow_auth_user_preferences_created");
    expect(migration).toContain("after insert on auth.users");
    expect(migration).toContain("select id from auth.users");
    expect(migration.match(/on conflict \(user_id\) do nothing/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("uses preferences for authenticated manual adds without browser user IDs", () => {
    expect(migration).toContain("function public.watchflow_add_user_movie");
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("default_movie_status, default_priority");
    expect(migration).toContain("security invoker");
  });
});

describe("user preference privilege patch contract", () => {
  it("grants table-level select, insert, and update without delete", () => {
    expect(privilegesPatch).toContain(
      "grant select, insert, update\non table public.user_preferences\nto authenticated;",
    );
    expect(privilegesPatch).not.toContain("grant delete");
  });

  it("keeps RLS enabled and safely backfills existing Auth users", () => {
    expect(privilegesPatch).toContain(
      "alter table public.user_preferences enable row level security;",
    );
    expect(privilegesPatch).toContain(
      "insert into public.user_preferences (user_id)\nselect id\nfrom auth.users\non conflict (user_id) do nothing;",
    );
  });

  it("does not recreate or modify preference policies", () => {
    expect(privilegesPatch).not.toContain("create policy");
    expect(privilegesPatch).not.toContain("drop policy");
    expect(privilegesPatch).not.toContain("alter policy");
  });
});
