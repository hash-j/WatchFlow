import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Part 18J-B security contracts", () => {
  const migration = source("supabase/migrations/202609290003_part_18j_b_google_oauth.sql");

  it("keeps OAuth state and credentials behind named server-only RPCs", () => {
    expect(migration).toContain("alter table public.calendar_oauth_states enable row level security");
    expect(migration).toContain("revoke all on table public.calendar_oauth_states from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("watchflow_set_calendar_sync_enabled(boolean)");
    expect(migration).toContain("v_user_id uuid := (select auth.uid())");
    expect(migration).toContain("on conflict (user_id, provider) do update");
    expect(migration).toContain("on delete cascade");
    expect(migration).not.toMatch(/grant (?:insert|update|delete|all) on table public\.calendar_(?:connections|credentials)/i);
    expect(migration).toContain("where c.user_id = p_user_id and c.provider = 'google'");
    expect(migration).toContain("delete from public.calendar_connections c");
  });

  it("stores hashes for one-time OAuth state and encrypted refresh tokens only", () => {
    expect(migration).toContain("state_hash bytea not null unique");
    expect(migration).toContain("consumed_at is null");
    expect(migration).toContain("refresh_token_ciphertext");
    expect(migration).not.toMatch(/\baccess_token\b/i);
  });

  it("keeps secrets and privileged clients server-only", () => {
    for (const file of [
      "lib/calendar/google-config.ts",
      "lib/calendar/google-provider.ts",
      "lib/calendar/oauth-store.ts",
      "lib/calendar/token-encryption.ts",
    ]) expect(source(file)).toContain('import "server-only"');
    const client = source("components/settings/calendar-settings.tsx");
    expect(client).not.toContain("SUPABASE_SECRET_KEY");
    expect(client).not.toContain("GOOGLE_CALENDAR_CLIENT_SECRET");
    expect(client).not.toContain("CALENDAR_TOKEN_ENCRYPTION_KEY");
  });

  it("does not implement calendar event transport in Part 18J-B", () => {
    const provider = source("lib/calendar/google-provider.ts");
    expect(provider).not.toContain("calendar/v3");
    expect(provider).not.toContain("events.insert");
  });

  it("uses fixed callback outcomes and fresh authenticated ownership", () => {
    const start = source("app/api/calendar/google/start/route.ts");
    const callback = source("app/api/calendar/google/callback/route.ts");
    const actions = source("app/(app)/settings/calendar/actions.ts");
    expect(start).toContain("supabase.auth.getUser()");
    expect(callback).toContain("supabase.auth.getUser()");
    expect(callback).toContain('"connected" | "denied" | "invalid" | "failed"');
    expect(callback).not.toContain("next=");
    expect(actions).toContain("authenticateSettings()");
    expect(actions).toContain("deleteGoogleCalendarConnection(session.user.id)");
  });

  it("preserves the Part 18J-A owner-read and credential-denial model", () => {
    const foundation = source("supabase/migrations/202609290001_part_18j_calendar_foundation.sql");
    expect(foundation).toContain("create policy watchflow_calendar_connections_select_own");
    expect(foundation).toContain("using (user_id = (select auth.uid()))");
    expect(foundation).toContain("revoke all on table public.calendar_credentials");
    expect(foundation).not.toMatch(/create policy[^;]*on public\.calendar_credentials/i);
  });
});
