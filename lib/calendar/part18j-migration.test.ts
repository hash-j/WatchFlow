import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202609290001_part_18j_calendar_foundation.sql",
  ),
  "utf8",
).toLowerCase();

describe("Part 18J-A calendar foundation migration", () => {
  it("creates the connection, credential, mapping, and desired-state job models", () => {
    expect(migration).toContain("create table public.calendar_connections");
    expect(migration).toContain("create table public.calendar_credentials");
    expect(migration).toContain("create table public.calendar_event_mappings");
    expect(migration).toContain("create table public.calendar_sync_jobs");
    expect(migration).toContain("provider text not null default 'google'");
    expect(migration).toContain("provider_calendar_id text not null default 'primary'");
    expect(migration).toContain("unique (user_id, provider)");
    expect(migration).toContain("unique (connection_id, source_key)");
  });

  it("keeps refresh credentials encrypted and inaccessible to normal roles", () => {
    expect(migration).toContain("refresh_token_ciphertext bytea not null");
    expect(migration).toContain("refresh_token_nonce bytea not null");
    expect(migration).toContain("refresh_token_auth_tag bytea not null");
    expect(migration).toContain("encryption_key_version smallint not null");
    expect(migration).toMatch(
      /revoke all on table public\.calendar_credentials\s+from public, anon, authenticated/,
    );
    expect(migration).not.toMatch(
      /grant [^;]+ on table public\.calendar_credentials to (anon|authenticated)/,
    );
    expect(migration).not.toMatch(
      /create policy [^;]+\s+on public\.calendar_credentials/,
    );
    expect(migration).not.toContain("access_token");
  });

  it("gives authenticated owners read-only operational visibility through RLS", () => {
    expect(migration.match(/enable row level security/g)).toHaveLength(4);
    expect(migration.match(/user_id = \(select auth\.uid\(\)\)/g)).toHaveLength(3);
    expect(migration).toContain(
      "grant select on table public.calendar_connections to authenticated",
    );
    expect(migration).toContain(
      "grant select on table public.calendar_event_mappings to authenticated",
    );
    expect(migration).toContain(
      "grant select on table public.calendar_sync_jobs to authenticated",
    );
    expect(migration).not.toMatch(
      /grant (insert|update|delete)[^;]+calendar_(connections|event_mappings|sync_jobs)[^;]+authenticated/,
    );
  });

  it("coalesces one desired job per source and preserves an identical active lease", () => {
    expect(migration).toContain(
      "on conflict on constraint calendar_sync_jobs_connection_source_key",
    );
    expect(migration).toContain(
      "public.calendar_sync_jobs.desired_operation = excluded.desired_operation",
    );
    expect(migration).toContain(
      "public.calendar_sync_jobs.source_version = excluded.source_version",
    );
    expect(migration).toContain(
      "then public.calendar_sync_jobs.lease_token",
    );
    expect(migration).toContain(
      "then public.calendar_sync_jobs.lease_expires_at",
    );
  });

  it("uses deterministic versions for every provider-visible source change", () => {
    expect(migration).toContain(
      "create or replace function public.watchflow_calendar_upsert_version",
    );
    expect(migration).toContain(
      "((extract(epoch from p_scheduled_for) * 1000000)::bigint)::text",
    );
    expect(migration).toContain("pg_catalog.char_length(p_schedule_timezone)");
    expect(migration).toContain("pg_catalog.char_length(p_movie_title)");
    expect(migration).toContain(
      "create or replace function public.watchflow_calendar_delete_version",
    );
  });

  it("synchronizes desired work for schedule lifecycle changes", () => {
    expect(migration).toContain(
      "after insert or update of status, scheduled_for, schedule_timezone or delete",
    );
    expect(migration).toContain("v_status = 'scheduled'");
    expect(migration).toContain("v_operation := 'upsert'");
    expect(migration).toContain("v_operation := case when p_cleanup then 'connection_cleanup' else 'delete' end");
    expect(migration).toContain("references public.user_movies(id) on delete set null");
  });

  it("claims bounded work exclusively and revalidates the source version", () => {
    expect(migration).toContain("p_batch_size not between 1 and 25");
    expect(migration).toContain("p_lease_seconds not between 30 and 300");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("candidate.attempt_count < candidate.attempt_limit");
    expect(migration).toContain("candidate.lease_expires_at <= pg_catalog.now()");
    expect(migration).toContain("v_current_version is distinct from v_job.source_version");
    expect(migration).toContain("'calendar_source_changed'");
  });

  it("finalizes only an exact unexpired lease and protects terminal work", () => {
    expect(migration).toContain("exact_job.state = 'leased'");
    expect(migration).toContain("exact_job.lease_token = p_lease_token");
    expect(migration).toContain("exact_job.source_version = p_source_version");
    expect(migration).toContain("exact_job.lease_expires_at > pg_catalog.now()");
    expect(migration).toContain("when 1 then 30");
    expect(migration).toContain("when 4 then 300");
    expect(migration).toContain("'calendar_attempt_limit_exhausted'");
  });

  it("reconciles mappings idempotently and preserves a deletion tombstone", () => {
    expect(migration).toContain(
      "create or replace function public.watchflow_calendar_provider_event_id",
    );
    expect(migration).toContain(
      "or p_provider_event_id <> public.watchflow_calendar_provider_event_id",
    );
    expect(migration).toContain(
      "on conflict on constraint calendar_event_mappings_connection_source_key",
    );
    expect(migration).toContain(
      "delete from public.calendar_event_mappings as deleted_mapping",
    );
    expect(migration).toContain("'calendar_event_already_absent'");
    expect(migration).toContain(
      "the source key survives user_movies deletion",
    );
  });

  it("exposes only bounded claim and finalize RPCs to service_role", () => {
    expect(migration).toMatch(
      /grant execute on function public\.watchflow_claim_calendar_sync_jobs\(integer, integer\)\s+to service_role/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.watchflow_finalize_calendar_sync_job\(uuid, uuid, text, text, text, text, integer, text\)\s+to service_role/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.watchflow_claim_calendar_sync_jobs\(integer, integer\)\s+from public, anon, authenticated/,
    );
    expect(migration).not.toMatch(/grant execute[^;]+to (anon|authenticated)/);
  });
});
