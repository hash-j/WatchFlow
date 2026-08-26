import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202608170001_part_15_5b_first_time_onboarding.sql",
);
const migration = readFileSync(migrationPath, "utf8").toLowerCase();

describe("Part 15.5B onboarding migration contract", () => {
  it("adds one nullable completion timestamp without an onboarding version", () => {
    expect(migration).toContain("add column if not exists onboarding_completed_at timestamptz");
    expect(migration).not.toContain("onboarding_version");
    expect(migration).not.toMatch(/onboarding_completed_at timestamptz\s+not null/);
  });

  it("backfills established profiles before future null rows", () => {
    expect(migration).toContain("update public.profiles");
    expect(migration).toContain("set onboarding_completed_at = now()");
    expect(migration).toContain("where onboarding_completed_at is null");
  });

  it("grants only the new profile column to authenticated and nothing to anon", () => {
    expect(migration).toContain("grant update (onboarding_completed_at)");
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("from public, anon");
    expect(migration).not.toMatch(/grant update\s+on table public\.profiles/);
    expect(migration).not.toMatch(/grant [^;]+ to anon/);
  });

  it("does not disable RLS or recreate unrelated policies", () => {
    expect(migration).not.toContain("disable row level security");
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("drop policy");
  });
});
