import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationNames = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

describe("Part 15.5F migration provenance and order", () => {
  it("keeps unique, chronological migration versions", () => {
    const versions = migrationNames.map((name) => name.split("_")[0]);

    expect(migrationNames).toEqual([...migrationNames].sort());
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.every((version) => /^\d{12}$/.test(version))).toBe(true);
  });

  it("keeps dependent patches after the migrations they amend", () => {
    const index = (name: string) => migrationNames.indexOf(name);

    expect(index("202607230001_user_preferences_privileges.sql")).toBeGreaterThan(
      index("202607220003_user_settings.sql"),
    );
    expect(index("202608030001_schedule_profile_permissions.sql")).toBeGreaterThan(
      index("202607300001_part_15_tmdb_rate_limits.sql"),
    );
    expect(
      index("202608170001_part_15_5b_first_time_onboarding.sql"),
    ).toBeGreaterThan(index("202608030001_schedule_profile_permissions.sql"));
    expect(
      index("202608290001_profiles_privilege_hardening.sql"),
    ).toBeGreaterThan(
      index("202608170001_part_15_5b_first_time_onboarding.sql"),
    );
    expect(
      index("202609210001_part_18a_queue_normalization.sql"),
    ).toBeGreaterThan(
      index("202609100001_part_16fb_library_actor_status.sql"),
    );
  });

  it("creates the required base objects before incremental migrations", () => {
    const baselineName = "202607200001_base_schema.sql";
    const baseline = readFileSync(
      resolve(migrationsDirectory, baselineName),
      "utf8",
    );

    expect(migrationNames[0]).toBe(baselineName);
    for (const table of ["profiles", "movies", "user_movies"]) {
      expect(baseline).toMatch(
        new RegExp(`create\\s+table\\s+public\\.${table}\\b`, "i"),
      );
      expect(baseline).toMatch(
        new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"),
      );
    }
    expect(baseline).toContain("watchflow_auth_user_profile_created");
    expect(baseline).toContain("auth.uid()");
  });

  it("preserves the evidenced baseline ownership and key contracts", () => {
    const baseline = readFileSync(
      resolve(migrationsDirectory, "202607200001_base_schema.sql"),
      "utf8",
    );

    expect(baseline).toMatch(/id uuid primary key references auth\.users\(id\) on delete cascade/i);
    expect(baseline).toMatch(/tmdb_id integer not null unique/i);
    expect(baseline).toMatch(/user_id uuid not null references auth\.users\(id\) on delete cascade/i);
    expect(baseline).toMatch(/movie_id bigint not null references public\.movies\(id\) on delete cascade/i);
    expect(baseline).toMatch(/unique \(user_id, movie_id\)/i);
    expect(baseline).toContain("for insert");
    expect(baseline).toContain("for update");
    expect(baseline).toContain("for delete");
    expect(baseline).toMatch(/security definer\s+set search_path = ''/i);
    expect(baseline).toMatch(/revoke all on function public\.watchflow_create_profile_for_auth_user\(\)/i);
  });

  it("leaves later milestone columns to their existing migrations", () => {
    const baseline = readFileSync(
      resolve(migrationsDirectory, "202607200001_base_schema.sql"),
      "utf8",
    );

    for (const laterColumn of [
      "schedule_note",
      "schedule_timezone",
      "favourite",
      "tmdb_adult",
      "metadata_language",
      "onboarding_completed_at",
    ]) {
      expect(baseline).not.toContain(laterColumn);
    }
    expect(baseline).not.toContain("create table public.user_preferences");
    expect(baseline).not.toContain("create table public.lists");
    expect(baseline).not.toContain("create table public.list_movies");
    expect(baseline).not.toContain("create table public.watchflow_tmdb_rate_limits");
  });
});
