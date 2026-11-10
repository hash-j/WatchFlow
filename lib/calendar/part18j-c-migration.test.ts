import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeSourceNewlines } from "../testing/source-text";

const migration = normalizeSourceNewlines(readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202609300001_part_18j_c_credential_rotation.sql",
  ),
  "utf8",
)).toLowerCase();
const pauseGuardMigration = normalizeSourceNewlines(readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202609300002_part_18j_c_pause_claim_guard.sql",
  ),
  "utf8",
)).toLowerCase();
const eventIdMigration = normalizeSourceNewlines(readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202609300003_part_18j_c_google_event_id_compatibility.sql",
  ),
  "utf8",
)).toLowerCase();
const pausedDesiredStateMigration = normalizeSourceNewlines(readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202609300004_part_18j_c_preserve_paused_desired_state.sql",
  ),
  "utf8",
)).toLowerCase();

const signature =
  "public.watchflow_replace_google_calendar_credential(\n  uuid, uuid, bytea, bytea, bytea, smallint\n)";

describe("Part 18J-C credential-rotation boundary", () => {
  it("is an owner-and-connection-bound security-definer RPC", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("connection.id = p_connection_id");
    expect(migration).toContain("connection.user_id = p_user_id");
    expect(migration).toContain("connection.provider = 'google'");
    expect(migration).toContain("return found");
  });

  it("updates only the encrypted credential envelope and its timestamp", () => {
    expect(migration).toContain("update public.calendar_credentials as credential");
    expect(migration).not.toMatch(/update public\.calendar_connections/);
    expect(migration).not.toMatch(/update public\.calendar_(event_mappings|sync_jobs)/);
    expect(migration).not.toMatch(/update public\.user_movies/);
    expect(migration).not.toContain("sync_enabled =");
    expect(migration).not.toContain("status =");
    expect(migration).not.toContain("connected_at =");
    expect(migration).not.toContain("provider_subject =");
    expect(migration).not.toContain("display_email =");
  });

  it("keeps paused state and all connection metadata outside rotation semantics", () => {
    const setClause = migration.match(
      /update public\.calendar_credentials[\s\S]*?from public\.calendar_connections/,
    )?.[0];
    expect(setClause).toBeTruthy();
    expect(setClause).not.toMatch(
      /sync_enabled|status|provider_subject|display_email|provider_calendar_id|connected_at/,
    );
  });

  it("denies browser roles and grants only the exact RPC to service_role", () => {
    expect(migration).toContain(
      `revoke execute on function ${signature}\n  from public, anon, authenticated, service_role`,
    );
    expect(migration).toContain(
      `grant execute on function ${signature}\n  to service_role`,
    );
    expect(migration.match(/grant execute on function/g)).toHaveLength(1);
    expect(migration).not.toContain("grant select on table");
    expect(migration).not.toContain("grant update on table");
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("alter table");
  });

  it("keeps paused and disconnect-pending connections outside all provider claims", () => {
    expect(pauseGuardMigration).toContain(
      "eligible_connection.status = 'connected'",
    );
    expect(pauseGuardMigration).toContain(
      "and eligible_connection.sync_enabled",
    );
    expect(pauseGuardMigration).toContain(
      "eligible_connection.status = 'reconnect_required'",
    );
    expect(pauseGuardMigration).not.toContain(
      "eligible_connection.status = 'disconnect_pending'",
    );
    expect(pauseGuardMigration).toContain(
      "create or replace function public.watchflow_claim_calendar_sync_jobs",
    );
    expect(pauseGuardMigration).not.toContain(
      "create or replace function public.watchflow_finalize_calendar_sync_job",
    );
  });

  it("preserves the exact claim signature and its service-role-only privilege", () => {
    expect(pauseGuardMigration).toContain(
      "revoke execute on function public.watchflow_claim_calendar_sync_jobs(integer, integer)\n  from public, anon, authenticated, service_role",
    );
    expect(pauseGuardMigration).toContain(
      "grant execute on function public.watchflow_claim_calendar_sync_jobs(integer, integer)\n  to service_role",
    );
    expect(pauseGuardMigration.match(/grant execute on function/g)).toHaveLength(1);
    expect(pauseGuardMigration).not.toContain("alter table");
    expect(pauseGuardMigration).not.toContain("create policy");
  });

  it("corrects pre-transport event IDs to Google's caller-supplied alphabet", () => {
    expect(eventIdMigration).toContain("select 'a' || pg_catalog.md5(");
    expect(eventIdMigration).toContain(
      "where mapping.provider_event_id ~ '^wf[0-9a-f]{32}$'",
    );
    expect(eventIdMigration).toContain(
      "revoke execute on function public.watchflow_calendar_provider_event_id(uuid, text)\n  from public, anon, authenticated, service_role",
    );
    expect(eventIdMigration).not.toContain("grant execute on function");
    expect(eventIdMigration).not.toContain("alter table");
    expect(eventIdMigration).not.toContain("create policy");
  });

  it("preserves the latest eligible upsert while provider delivery is paused", () => {
    expect(pausedDesiredStateMigration).toContain(
      "create or replace function public.watchflow_enqueue_calendar_sync",
    );
    expect(pausedDesiredStateMigration).toContain(
      "v_connection.status in ('connected', 'reconnect_required')",
    );
    expect(pausedDesiredStateMigration).not.toContain(
      "and v_connection.sync_enabled",
    );
    expect(pausedDesiredStateMigration).toContain(
      "revoke execute on function public.watchflow_enqueue_calendar_sync(\n  uuid, uuid, boolean, boolean\n)\n  from public, anon, authenticated, service_role",
    );
    expect(pausedDesiredStateMigration).not.toContain("grant execute on function");
    expect(pausedDesiredStateMigration).not.toContain("alter table");
    expect(pausedDesiredStateMigration).not.toContain("create policy");
  });
});
