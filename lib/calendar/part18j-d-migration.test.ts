import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeSourceNewlines } from "../testing/source-text";

const migration = normalizeSourceNewlines(readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609300005_part_18j_d_disconnect_reconciliation.sql",
  ),
  "utf8",
)).toLowerCase();

describe("Part 18J-D disconnect reconciliation migration", () => {
  it("turns disconnect into idempotent cleanup work without deleting credentials early", () => {
    expect(migration).toContain("status = 'disconnect_pending'");
    expect(migration).toContain("sync_enabled = false");
    expect(migration).toContain("desired_operation = 'connection_cleanup'");
    expect(migration).toContain("sync_state = 'delete_pending'");
    expect(migration).toContain("on conflict on constraint calendar_sync_jobs_connection_source_key");

    const disconnect = migration.match(
      /create or replace function public\.watchflow_disconnect_google_calendar_connection[\s\S]*?\n\$\$;/,
    )?.[0];
    expect(disconnect).toBeTruthy();
    expect(disconnect).not.toContain("delete from public.calendar_credentials");
    expect(disconnect).toContain("not exists (");
    expect(disconnect).toContain("delete from public.calendar_connections as empty_connection");
  });

  it("claims cleanup only for disconnect-pending connections and keeps bounds and leases", () => {
    expect(migration).toContain(
      "eligible_connection.status = 'disconnect_pending'\n              and candidate.desired_operation = 'connection_cleanup'",
    );
    expect(migration).toContain("p_batch_size not between 1 and 25");
    expect(migration).toContain("p_lease_seconds not between 30 and 300");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("candidate.lease_expires_at <= pg_catalog.now()");
  });

  it("removes exact mappings and local connection state only after cleanup convergence", () => {
    expect(migration).toContain(
      "delete from public.calendar_event_mappings as deleted_mapping",
    );
    expect(migration).toContain(
      "v_job.desired_operation = 'connection_cleanup'",
    );
    expect(migration).toContain(
      "delete from public.calendar_connections as completed_connection",
    );
    expect(migration).toContain(
      "completed_connection.status = 'disconnect_pending'",
    );
    expect(migration).toContain(
      "v_provider_event_id <> public.watchflow_calendar_provider_event_id",
    );
    expect(migration).toContain("calendar_mapping_identity_invalid");
  });

  it("delays cleanup behind an in-flight provider mutation and serializes final cleanup", () => {
    expect(migration).toContain(
      "when public.calendar_sync_jobs.state = 'leased'",
    );
    expect(migration).toContain(
      "public.calendar_sync_jobs.lease_expires_at",
    );
    expect(migration).toContain(
      "cleanup_connection.status = 'disconnect_pending'",
    );
    expect(migration).toContain("for update;");
    expect(migration).toContain(
      "create or replace function public.watchflow_is_final_calendar_cleanup",
    );
    expect(migration).toContain(
      "other_cleanup_job.state not in ('succeeded', 'skipped')",
    );
  });

  it("keeps revoked cleanup visible and reauthorizes only the same account", () => {
    expect(migration).toContain(
      "v_job.desired_operation <> 'connection_cleanup'",
    );
    expect(migration).toContain(
      "v_connection.provider_subject <> p_provider_subject",
    );
    expect(migration).toContain("calendar cleanup must be reauthorized with the same google account");
    expect(migration).toContain("status = 'disconnect_pending'");
    expect(migration).toContain("cleanup_job.state = 'auth_required'");
    expect(migration).toContain(
      "remaining_cleanup_job.state not in ('succeeded', 'skipped')",
    );
  });

  it("reasserts the narrow service-role boundary without table grants or RLS changes", () => {
    for (const signature of [
      "public.watchflow_upsert_google_calendar_connection(",
      "public.watchflow_disconnect_google_calendar_connection(uuid)",
      "public.watchflow_claim_calendar_sync_jobs(integer, integer)",
      "public.watchflow_is_final_calendar_cleanup(uuid, uuid, text)",
      "public.watchflow_finalize_calendar_sync_job(",
    ]) {
      expect(migration).toContain(`revoke execute on function ${signature}`);
      expect(migration).toContain(`grant execute on function ${signature}`);
    }
    expect(migration).not.toContain("grant select on table");
    expect(migration).not.toContain("grant update on table");
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("disable row level security");
  });
});
