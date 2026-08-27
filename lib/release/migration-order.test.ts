import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationNames = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

describe("Part 15.5E migration order", () => {
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
  });

  it("does not conceal the known missing base-schema migration", () => {
    const sql = migrationNames
      .map((name) => readFileSync(resolve(migrationsDirectory, name), "utf8"))
      .join("\n");
    const databaseDocumentation = readFileSync(
      resolve(process.cwd(), "docs/DATABASE.md"),
      "utf8",
    );

    for (const table of ["profiles", "movies", "user_movies"]) {
      expect(sql).not.toMatch(
        new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${table}\\b`, "i"),
      );
    }
    expect(databaseDocumentation).toMatch(
      /does not contain the original\s+base-schema migration/,
    );
  });
});
