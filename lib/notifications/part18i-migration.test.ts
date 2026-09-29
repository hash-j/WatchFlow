import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202609280001_part_18i_scheduled_reminders.sql"),
  "utf8",
).toLowerCase();
const ambiguityFix = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202609280002_part_18i_fix_subscription_id_ambiguity.sql",
  ),
  "utf8",
).replaceAll("\r\n", "\n").toLowerCase();

describe("Part 18I scheduled reminder migration contract", () => {
  it("creates owner-scoped job and delivery ledgers without user writes", () => {
    expect(migration).toContain("create table public.scheduled_notification_jobs");
    expect(migration).toContain("create table public.scheduled_notification_deliveries");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("user_id = (select auth.uid())");
    expect(migration).toContain("grant select on table public.scheduled_notification_jobs to authenticated");
    expect(migration).not.toMatch(/grant (insert|update|delete)[\s\S]{0,80}scheduled_notification_jobs to authenticated/);
    expect(migration).toContain("references public.user_movies(id) on delete cascade");
    expect(migration).toContain("references auth.users(id) on delete cascade");
  });

  it("maintains jobs for schedule and preference changes", () => {
    expect(migration).toContain("after insert or update of status, scheduled_for, schedule_timezone");
    expect(migration).toContain("after insert or update of schedule_reminders_enabled, reminder_offset_minutes");
    expect(migration).toContain("v_movie.scheduled_for - pg_catalog.make_interval(mins => v_offset)");
    expect(migration).toContain("'reminders_disabled'");
    expect(migration).toContain("'schedule_changed'");
  });

  it("uses deterministic identities, bounded leases, claims, and retries", () => {
    expect(migration).toContain("watchflow_part18i_uuid('scheduled-reminder', v_key)");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("p_batch_size not between 1 and 25");
    expect(migration).toContain("p_lease_seconds not between 30 and 300");
    expect(migration).toContain("attempts between 0 and 5");
    expect(migration).toContain("attempts between 0 and 3");
    expect(migration).toContain("lease_expired_unknown_delivery");
    expect(migration).toContain("unique (schedule_key, subscription_id)");
    expect(migration).toContain("on conflict (schedule_key, subscription_id) do nothing");
    expect(migration).toContain("extract(epoch from v_movie.scheduled_for)");
    expect(migration).toContain("extract(epoch from pg_catalog.now())");
    expect(migration).not.toContain("pg_catalog.extract(");
  });

  it("rechecks owner, schedule, preferences, and push before delivery", () => {
    expect(migration).toContain("join auth.users au on au.id = um.user_id");
    expect(migration).toContain("up.schedule_reminders_enabled = true");
    expect(migration).toContain("um.scheduled_for = v_job.scheduled_for");
    expect(migration).toContain("um.schedule_timezone = v_job.schedule_timezone");
    expect(migration).toContain("v_movie.schedule_timezone || ':' || v_offset::text");
    expect(migration).toContain("push_notifications_enabled");
    expect(migration).toContain("expiration_time <=");
    expect(migration).toContain("'in_app_only_no_subscription'");
  });

  it("creates one durable notification and safely cleans invalid subscriptions", () => {
    expect(migration).toContain("insert into public.notifications");
    expect(migration).toContain("on conflict (id) do nothing");
    expect(migration).toContain("'category', 'schedule_reminders'");
    expect(migration).toContain("v_status in (404, 410)");
    expect(migration).toContain("delete from public.push_subscriptions");
    expect(migration).toContain("state in ('pending', 'retry') and attempts < 3");
  });

  it("exposes only the claim/finalize RPCs to service_role", () => {
    expect(migration).toMatch(/grant execute on function public\.watchflow_claim_scheduled_reminders\(integer, integer\)\s+to service_role/);
    expect(migration).toMatch(/grant execute on function public\.watchflow_finalize_scheduled_reminder\(uuid, uuid, jsonb\)\s+to service_role/);
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("removes the claim output-variable ambiguity through an explicit constraint target", () => {
    const ambiguous = "on conflict (schedule_key, subscription_id) do nothing";
    const qualified =
      "on conflict on constraint watchflow_scheduled_delivery_schedule_subscription_key do nothing";
    const effectiveClaim = migration.replace(ambiguous, qualified);
    const claimStart = effectiveClaim.indexOf(
      "create or replace function public.watchflow_claim_scheduled_reminders",
    );
    const claimEnd = effectiveClaim.indexOf(
      "create or replace function public.watchflow_finalize_scheduled_reminder",
    );
    const effectiveClaimBody = effectiveClaim.slice(claimStart, claimEnd);

    expect(migration.match(new RegExp(ambiguous.replace(/[()]/g, "\\$&"), "g")))
      .toHaveLength(1);
    expect(ambiguityFix).toContain(`v_ambiguous_statement constant text :=\n    '${ambiguous}'`);
    expect(ambiguityFix).toContain(`v_qualified_statement constant text :=\n    '${qualified}'`);
    expect(ambiguityFix).toContain("pg_catalog.pg_get_functiondef(");
    expect(ambiguityFix).toContain("execute v_function_definition");
    expect(effectiveClaimBody).toContain(qualified);
    expect(effectiveClaimBody).not.toContain(ambiguous);
    expect(effectiveClaimBody).not.toMatch(
      /on conflict\s*\([^)]*\bsubscription_id\b[^)]*\)/,
    );
  });

  it("preserves the service-role-only claim boundary in the corrective migration", () => {
    expect(ambiguityFix).toContain(
      "alter table public.scheduled_notification_deliveries rename constraint %i to watchflow_scheduled_delivery_schedule_subscription_key",
    );
    expect(ambiguityFix).toMatch(
      /revoke all on function public\.watchflow_claim_scheduled_reminders\(integer, integer\)\s+from public, anon, authenticated/,
    );
    expect(ambiguityFix).toMatch(
      /grant execute on function public\.watchflow_claim_scheduled_reminders\(integer, integer\)\s+to service_role/,
    );
    expect(ambiguityFix).not.toMatch(/grant execute[\s\S]*to (anon|authenticated)/);
  });
});
