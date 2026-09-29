import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202609290002_part_18j_restrict_helper_execution.sql",
  ),
  "utf8",
).toLowerCase();

const internalHelpers = [
  "public.watchflow_part18j_uuid(text, text)",
  "public.watchflow_calendar_source_key(uuid, uuid)",
  "public.watchflow_calendar_upsert_version(\n  text, timestamptz, text, text, integer\n)",
  "public.watchflow_calendar_delete_version(text)",
  "public.watchflow_calendar_provider_event_id(uuid, text)",
  "public.watchflow_enqueue_calendar_sync(\n  uuid, uuid, boolean, boolean\n)",
  "public.watchflow_sync_calendar_job_trigger()",
] as const;

const claimSignature =
  "public.watchflow_claim_calendar_sync_jobs(\n  integer, integer\n)";
const finalizeSignature =
  "public.watchflow_finalize_calendar_sync_job(\n  uuid, uuid, text, text, text, text, integer, text\n)";

describe("Part 18J-A service-role privilege correction", () => {
  it("explicitly revokes every internal helper from all externally callable roles", () => {
    for (const signature of internalHelpers) {
      expect(migration).toContain(
        `revoke execute on function ${signature}\n  from public, anon, authenticated, service_role`,
      );
      expect(migration).not.toContain(
        `grant execute on function ${signature}`,
      );
    }
  });

  it("reasserts service_role execution only for claim and finalize", () => {
    for (const signature of [claimSignature, finalizeSignature]) {
      expect(migration).toContain(
        `revoke execute on function ${signature}\n  from public, anon, authenticated, service_role`,
      );
      expect(migration).toContain(
        `grant execute on function ${signature}\n  to service_role`,
      );
    }

    expect(migration.match(/grant execute on function/g)).toHaveLength(2);
    expect(migration).not.toMatch(/grant execute[\s\S]*to (public|anon|authenticated)/);
  });

  it("changes privileges only and preserves data, RLS, signatures, and behavior", () => {
    expect(migration).not.toMatch(/\b(insert|update|delete|truncate)\s+(into|from|public\.)/);
    expect(migration).not.toContain("alter table");
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("drop policy");
    expect(migration).not.toContain("create or replace function");
    expect(migration).not.toContain("drop function");
  });
});
