import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "202607300001_part_15_tmdb_rate_limits.sql";
const schedulingPermissionMigrationName =
  "202608030001_schedule_profile_permissions.sql";
const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const migration = readFileSync(
  resolve(migrationsDirectory, migrationName),
  "utf8",
)
  .toLowerCase()
  .replaceAll("\r\n", "\n");
const compactMigration = migration.replace(/\s+/g, " ");
const schedulingPermissionMigration = readFileSync(
  resolve(migrationsDirectory, schedulingPermissionMigrationName),
  "utf8",
)
  .toLowerCase()
  .replaceAll("\r\n", "\n");
const allMigrationSql = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(resolve(migrationsDirectory, name), "utf8"))
  .join("\n")
  .toLowerCase()
  .replaceAll("\r\n", "\n");

const securityAudit = readFileSync(
  resolve(
    process.cwd(),
    "supabase/verification/production_security_audit.sql",
  ),
  "utf8",
).toLowerCase();
const readinessAudit = readFileSync(
  resolve(
    process.cwd(),
    "supabase/verification/development_readiness.sql",
  ),
  "utf8",
).toLowerCase();

function functionSql(name: string) {
  const start = migration.indexOf(
    `create or replace function public.${name}(`,
  );
  const end = migration.indexOf("\ncomment on function", start);

  return migration.slice(start, end < 0 ? migration.length : end);
}

function executableStatements(sql: string) {
  return sql
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

describe("Part 15 database migration contract", () => {
  it("uses the one authorized Part 15 migration", () => {
    const part15Migrations = readdirSync(
      resolve(process.cwd(), "supabase/migrations"),
    ).filter((name) => name.includes("_part_15_tmdb_"));

    expect(part15Migrations).toEqual([migrationName]);
  });

  it("adds nullable cache-safety metadata without treating old rows as fresh", () => {
    const movieAlter = compactMigration.slice(
      compactMigration.indexOf("alter table public.movies"),
      compactMigration.indexOf("comment on column public.movies.tmdb_adult"),
    );

    expect(movieAlter).toContain(
      "add column if not exists tmdb_adult boolean",
    );
    expect(movieAlter).toContain(
      "add column if not exists metadata_language text",
    );
    expect(movieAlter).not.toContain("default");
    expect(compactMigration).toContain("movies_metadata_language_check");
    expect(compactMigration).toContain(
      "metadata_language ~ '^[a-z]{2}(-[a-z]{2})?$'",
    );
  });

  it("repairs and prevents schedule-less scheduled defaults", () => {
    const preferenceRepair = compactMigration.slice(
      compactMigration.indexOf("update public.user_preferences"),
      compactMigration.indexOf(
        "create table public.watchflow_tmdb_rate_limits",
      ),
    );

    expect(preferenceRepair).toContain(
      "set default_movie_status = 'want_to_watch'",
    );
    expect(preferenceRepair).toContain(
      "where default_movie_status = 'scheduled'",
    );
    expect(preferenceRepair).toContain(
      "drop constraint if exists user_preferences_default_movie_status_check",
    );
    for (const status of [
      "want_to_watch",
      "watch_next",
      "currently_watching",
      "watched",
      "on_hold",
      "dropped",
    ]) {
      expect(preferenceRepair).toContain(`'${status}'`);
    }
    const replacementCheck = preferenceRepair.slice(
      preferenceRepair.indexOf(
        "add constraint user_preferences_default_movie_status_check",
      ),
      preferenceRepair.indexOf(
        "-- replace the management functions",
      ),
    );
    expect(replacementCheck).not.toContain("'scheduled'");
  });

  it("makes shared movies browser-readable but server-write-only", () => {
    expect(compactMigration).toContain(
      "revoke all privileges on table public.movies from public, anon, authenticated",
    );
    expect(compactMigration).toContain(
      "revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s)",
    );
    expect(compactMigration).toContain(
      "grant select on table public.movies to authenticated",
    );
  });

  it("keeps management, scheduling, and queue compaction transactional", () => {
    const management = functionSql(
      "watchflow_update_library_movie",
    ).replace(/\s+/g, " ");
    const scheduling = functionSql("watchflow_schedule_movie").replace(
      /\s+/g,
      " ",
    );

    for (const functionBody of [management, scheduling]) {
      expect(functionBody).toContain("security invoker");
      expect(functionBody).toContain("v_user_id uuid := (select auth.uid())");
      expect(functionBody).toContain(
        "perform public.watchflow_normalize_queue()",
      );
      expect(functionBody).not.toContain("p_user_id");
    }
    expect(management).toContain("schedule_timezone = case");
    expect(scheduling).toContain(
      "where id = p_library_id and user_id = v_user_id for update",
    );
    expect(scheduling).toContain("if not found then return false");
    const ownerLookup = scheduling.indexOf(
      "perform 1 from public.user_movies where id = p_library_id and user_id = v_user_id for update",
    );
    const profileUpdate = scheduling.indexOf(
      "update public.profiles set timezone = p_timezone, updated_at = pg_catalog.now() where id = v_user_id",
    );
    expect(ownerLookup).toBeGreaterThanOrEqual(0);
    expect(profileUpdate).toBeGreaterThan(ownerLookup);
    expect(scheduling).toContain("status = 'scheduled'");
    expect(scheduling).toContain("queue_position = null");
    expect(scheduling).toContain("scheduled_for = p_scheduled_for");
    expect(scheduling).toContain("schedule_timezone = p_timezone");
    expect(scheduling).toContain("return true");
  });

  it("creates one private counter row per Auth user and operation", () => {
    expect(compactMigration).toContain(
      "create table public.watchflow_tmdb_rate_limits",
    );
    expect(compactMigration).toContain(
      "user_id uuid not null references auth.users(id) on delete cascade",
    );
    expect(compactMigration).toContain(
      "primary key (user_id, operation)",
    );
    for (const operation of [
      "search",
      "details",
      "import_search",
      "import_details",
    ]) {
      expect(compactMigration).toContain(`'${operation}'`);
    }
    expect(compactMigration).toContain(
      "alter table public.watchflow_tmdb_rate_limits enable row level security",
    );
    expect(compactMigration).not.toContain("create policy");
    expect(compactMigration).toContain(
      "revoke all on table public.watchflow_tmdb_rate_limits from public, anon, authenticated",
    );
    expect(compactMigration).not.toMatch(
      /grant[^;]+on table public\.watchflow_tmdb_rate_limits/,
    );
    expect(compactMigration).not.toMatch(/create\s+(?:unique\s+)?index/);
  });

  it("uses hardcoded authenticated buckets and validates cost", () => {
    const limiter = functionSql("watchflow_take_tmdb_rate_limit").replace(
      /\s+/g,
      " ",
    );

    expect(limiter).toContain("security definer");
    expect(limiter).toMatch(/set search_path = ''/);
    expect(limiter).toContain("v_user_id uuid := (select auth.uid())");
    expect(limiter).not.toContain("p_user_id");
    expect(limiter).toContain(
      "when 'search' then v_limit := 30; v_window_seconds := 60;",
    );
    expect(limiter).toContain(
      "when 'details' then v_limit := 20; v_window_seconds := 60;",
    );
    expect(limiter).toContain(
      "when 'import_search' then v_limit := 120; v_window_seconds := 600;",
    );
    expect(limiter).toContain(
      "when 'import_details' then v_limit := 120; v_window_seconds := 600;",
    );
    expect(limiter).toContain(
      "p_cost is null or p_cost < 1 or p_cost > v_limit",
    );
  });

  it("serializes first use and increments before returning a stable result", () => {
    const limiter = functionSql("watchflow_take_tmdb_rate_limit");

    expect(limiter).toContain("pg_advisory_xact_lock");
    expect(limiter).toContain("hashtextextended");
    expect(limiter).toContain("for update");
    expect(limiter).toContain(
      "insert into public.watchflow_tmdb_rate_limits",
    );
    expect(limiter).toContain(
      "update public.watchflow_tmdb_rate_limits",
    );
    expect(limiter).toContain(
      "v_window_started_at\n      + pg_catalog.make_interval(secs => v_window_seconds) <= v_now",
    );
    expect(limiter).toContain("v_window_started_at := v_now");
    expect(limiter).toContain(
      "where rate_limit.user_id = v_user_id\n    and rate_limit.operation = p_operation",
    );
    for (const key of [
      "allowed",
      "remaining",
      "retry_after_seconds",
      "limit",
      "window_seconds",
    ]) {
      expect(limiter).toContain(`'${key}'`);
    }
  });

  it("exposes only the limiter function to authenticated callers", () => {
    expect(compactMigration).toContain(
      "revoke all on function public.watchflow_take_tmdb_rate_limit(text, integer) from public, anon, authenticated",
    );
    expect(compactMigration).toContain(
      "grant execute on function public.watchflow_take_tmdb_rate_limit(text, integer) to authenticated",
    );
  });
});

describe("scheduling profile permission patch contract", () => {
  it("contains only the transaction and exact two-column authenticated grant", () => {
    expect(executableStatements(schedulingPermissionMigration)).toEqual([
      "begin",
      "grant update (timezone, updated_at) on table public.profiles to authenticated",
      "commit",
    ]);
    expect(schedulingPermissionMigration).toContain(
      "security invoker scheduling rpc updates these two columns",
    );
    expect(schedulingPermissionMigration).toContain("owned profile row");
  });

  it("does not add a table-level grant, another role, policy, or function", () => {
    expect(schedulingPermissionMigration).not.toMatch(
      /grant\s+update\s+on\s+(?:table\s+)?public\.profiles/,
    );
    expect(schedulingPermissionMigration).not.toMatch(
      /\bto\s+(?:public|anon)\b/,
    );
    expect(schedulingPermissionMigration).not.toMatch(
      /\b(?:create|alter|drop)\s+(?:policy|function|table)\b/,
    );
    expect(schedulingPermissionMigration).not.toContain(
      "disable row level security",
    );
  });

  it("keeps version-controlled profile UPDATE access limited to intended columns", () => {
    const grantedColumns = new Set<string>();
    const columnGrantPattern =
      /grant\s+update\s*\(([a-z_,\s]+)\)\s+on\s+(?:table\s+)?public\.profiles\s+to\s+authenticated\s*;/g;

    for (const match of allMigrationSql.matchAll(columnGrantPattern)) {
      for (const column of match[1].split(",")) {
        grantedColumns.add(column.trim());
      }
    }

    expect([...grantedColumns].sort()).toEqual([
      "avatar_url",
      "country",
      "full_name",
      "onboarding_completed_at",
      "timezone",
      "updated_at",
    ]);
    const tableGrantPattern =
      /grant\s+([^;(]+?)\s+on\s+(?:table\s+)?public\.profiles\s+to\s+authenticated\s*;/g;
    const tablePrivileges = [...allMigrationSql.matchAll(tableGrantPattern)]
      .flatMap((match) => match[1].split(","))
      .map((privilege) => privilege.replace(/\s+/g, " ").trim());
    expect(tablePrivileges).not.toContain("update");
    expect(tablePrivileges).not.toContain("all");
    expect(tablePrivileges).not.toContain("all privileges");
    expect(readinessAudit).toContain("('authenticated', 'update', false)");
    expect(readinessAudit).toContain(
      "'profiles.' || expected.role_name || '_table_'",
    );
    expect(readinessAudit).toContain("has_column_privilege");
    for (const column of [
      "full_name",
      "onboarding_completed_at",
      "avatar_url",
      "country",
      "timezone",
      "updated_at",
    ]) {
      expect(readinessAudit).toContain(`'${column}'`);
    }
  });

  it("leaves ownership RLS intact and requires it in the live audit", () => {
    expect(schedulingPermissionMigration).not.toContain("policy");
    expect(securityAudit).toContain("('profiles', 'update', true)");
    expect(securityAudit).toContain("when 'update' then");
    expect(securityAudit).toContain("coalesce(policies.qual, '')");
    expect(securityAudit).toContain("coalesce(policies.with_check, '')");
  });
});

describe("Part 15 read-only verification contracts", () => {
  it("audits all private/shared/internal tables, policies, and privileges", () => {
    for (const table of [
      "profiles",
      "movies",
      "user_movies",
      "user_preferences",
      "lists",
      "list_movies",
      "watchflow_tmdb_rate_limits",
    ]) {
      expect(securityAudit).toContain(`'${table}'`);
    }

    expect(securityAudit).toContain("pg_catalog.pg_policies");
    expect(securityAudit).toContain("has_table_privilege");
    expect(securityAudit).toContain("has_any_column_privilege");
    expect(securityAudit).toContain("unsafe_true_policy");
    expect(securityAudit).toContain("limiter_has_no_policies");
    expect(securityAudit).toContain("missing_policy");
    expect(securityAudit).toContain("effective_privileges");
  });

  it("checks readiness from real objects rather than migration history", () => {
    for (const object of [
      "watchflow_normalize_queue",
      "move_watch_queue_item",
      "watchflow_add_user_movie",
      "watchflow_library_rows",
      "watchflow_bulk_remove_library_movies",
      "watchflow_list_summaries",
      "watchflow_take_tmdb_rate_limit",
      "tmdb_adult",
      "metadata_language",
      "movies_metadata_language_check",
      "default_status_schedule_safety",
      "profiles_backfill",
      "user_preferences_backfill",
    ]) {
      expect(readinessAudit).toContain(object);
    }

    expect(readinessAudit).toContain("'installed'");
    expect(readinessAudit).toContain("'missing'");
    expect(readinessAudit).not.toContain("supabase_migrations");
  });

  it("keeps both verification files read-only", () => {
    for (const audit of [securityAudit, readinessAudit]) {
      expect(audit).not.toMatch(
        /^\s*(?:insert|update|delete|alter|create|drop|truncate)\b/im,
      );
    }
  });
});
