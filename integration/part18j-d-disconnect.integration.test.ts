import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createCalendarProviderEventId,
} from "@/lib/calendar/identifiers";

const PINNED_DEVELOPMENT_REF = "ckwadpmvxieekjlsfcks";
const value = (name: string) => process.env[name]?.trim() || null;

function origin(name: string) {
  try {
    return new URL(value(name) ?? "").origin;
  } catch {
    return null;
  }
}

const configuredOrigin = origin("NEXT_PUBLIC_SUPABASE_URL");
const expectedOrigin = origin("E2E_EXPECTED_SUPABASE_URL");
const enabled =
  process.env.RUN_PART18J_D_INTEGRATION_TESTS === "true" &&
  process.env.E2E_TARGET_ENV === "development" &&
  configuredOrigin === expectedOrigin &&
  configuredOrigin !== null &&
  new URL(configuredOrigin).hostname === `${PINNED_DEVELOPMENT_REF}.supabase.co` &&
  [
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "E2E_USER_B_EMAIL",
    "E2E_USER_B_PASSWORD",
  ].every((name) => value(name));

const liveDescribe = enabled ? describe : describe.skip;

liveDescribe.sequential("Part 18J-D guarded disconnect reconciliation", () => {
  let admin: SupabaseClient;
  let owner: SupabaseClient;
  let otherUser: SupabaseClient;
  let ownerId = "";
  let connectionId = "";
  const subject = `part18jd-${randomUUID()}`;
  const sourceKeys = [randomBytes(16).toString("hex"), randomBytes(16).toString("hex")];

  async function claim(batchSize = 10) {
    const result = await admin.rpc("watchflow_claim_calendar_sync_jobs", {
      p_batch_size: batchSize,
      p_lease_seconds: 30,
    });
    expect(result.error).toBeNull();
    return (result.data ?? []) as Array<Record<string, unknown>>;
  }

  async function finalize(
    row: Record<string, unknown>,
    outcome: "succeeded" | "retryable" | "auth_required",
    status: number,
    errorCode: string | null = null,
  ) {
    const result = await admin.rpc("watchflow_finalize_calendar_sync_job", {
      p_job_id: row.job_id,
      p_lease_token: row.lease_token,
      p_source_version: row.source_version,
      p_outcome: outcome,
      p_provider_event_id: row.provider_event_id,
      p_provider_etag: null,
      p_provider_status_code: status,
      p_error_code: errorCode,
    });
    expect(result.error).toBeNull();
    expect(result.data).toBe(true);
  }

  beforeAll(async () => {
    expect(configuredOrigin).toBe(`https://${PINNED_DEVELOPMENT_REF}.supabase.co`);
    expect(expectedOrigin).toBe(configuredOrigin);
    admin = createClient(configuredOrigin!, value("SUPABASE_SECRET_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const password = `Part18JD-${randomUUID()}-Aa1!`;
    const created = await admin.auth.admin.createUser({
      email: `part18jd-${randomUUID()}@example.invalid`,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    ownerId = created.data.user!.id;

    owner = createClient(
      configuredOrigin!,
      value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const signedIn = await owner.auth.signInWithPassword({
      email: created.data.user!.email!,
      password,
    });
    expect(signedIn.error).toBeNull();

    otherUser = createClient(
      configuredOrigin!,
      value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const otherSignIn = await otherUser.auth.signInWithPassword({
      email: value("E2E_USER_B_EMAIL")!,
      password: value("E2E_USER_B_PASSWORD")!,
    });
    expect(otherSignIn.error).toBeNull();

    const connection = await admin
      .from("calendar_connections")
      .insert({
        user_id: ownerId,
        provider: "google",
        provider_subject: subject,
        display_email: "part18jd@example.invalid",
        provider_calendar_id: "primary",
        sync_enabled: true,
        status: "connected",
        granted_scopes: ["https://www.googleapis.com/auth/calendar.events"],
      })
      .select("id")
      .single();
    expect(connection.error).toBeNull();
    connectionId = connection.data!.id;

    const credential = await admin.from("calendar_credentials").insert({
      connection_id: connectionId,
      refresh_token_ciphertext: "\\x0102",
      refresh_token_nonce: `\\x${"03".repeat(12)}`,
      refresh_token_auth_tag: `\\x${"04".repeat(16)}`,
      encryption_key_version: 1,
    });
    expect(credential.error).toBeNull();

    const mappings = await admin.from("calendar_event_mappings").insert(
      sourceKeys.map((sourceKey) => ({
        user_id: ownerId,
        connection_id: connectionId,
        source_key: sourceKey,
        provider_calendar_id: "primary",
        provider_event_id: createCalendarProviderEventId(connectionId, sourceKey),
        source_version: randomBytes(16).toString("hex"),
        sync_state: "synced",
      })),
    );
    expect(mappings.error).toBeNull();
  }, 30_000);

  afterAll(async () => {
    if (admin && ownerId) {
      await admin.from("calendar_connections").delete().eq("id", connectionId);
      await admin.auth.admin.deleteUser(ownerId);
    }
    await Promise.allSettled([owner?.auth.signOut(), otherUser?.auth.signOut()]);
  }, 30_000);

  it("coalesces exact cleanup jobs and preserves owner isolation", async () => {
    const first = await admin.rpc("watchflow_disconnect_google_calendar_connection", {
      p_user_id: ownerId,
    });
    const repeated = await admin.rpc("watchflow_disconnect_google_calendar_connection", {
      p_user_id: ownerId,
    });
    expect(first.error).toBeNull();
    expect(repeated.error).toBeNull();
    expect(first.data).toBe(true);
    expect(repeated.data).toBe(true);

    const [connection, credential, jobs, ownerView, otherView] = await Promise.all([
      admin.from("calendar_connections").select("status,sync_enabled").eq("id", connectionId).single(),
      admin.from("calendar_credentials").select("connection_id").eq("connection_id", connectionId).single(),
      admin.from("calendar_sync_jobs").select("source_key,desired_operation,state").eq("connection_id", connectionId),
      owner.from("calendar_sync_jobs").select("source_key").eq("connection_id", connectionId),
      otherUser.from("calendar_sync_jobs").select("source_key").eq("connection_id", connectionId),
    ]);
    expect(connection.data).toEqual({ status: "disconnect_pending", sync_enabled: false });
    expect(credential.error).toBeNull();
    expect(jobs.data).toHaveLength(2);
    expect(jobs.data?.every((job) => job.desired_operation === "connection_cleanup")).toBe(true);
    expect(ownerView.data).toHaveLength(2);
    expect(otherView.data).toEqual([]);
  });

  it("keeps revoked cleanup visible, resumes same-account authorization, and converges", async () => {
    const firstClaim = await claim(1);
    expect(firstClaim).toHaveLength(1);
    await finalize(
      firstClaim[0],
      "auth_required",
      401,
      "google_authorization_required",
    );

    const blocked = await admin
      .from("calendar_connections")
      .select("status,last_error_code")
      .eq("id", connectionId)
      .single();
    expect(blocked.data).toEqual({
      status: "disconnect_pending",
      last_error_code: "google_authorization_required",
    });

    const wrongAccount = await admin.rpc("watchflow_upsert_google_calendar_connection", {
      p_user_id: ownerId,
      p_provider_subject: `${subject}-wrong`,
      p_display_email: "wrong@example.invalid",
      p_granted_scopes: ["https://www.googleapis.com/auth/calendar.events"],
      p_refresh_token_ciphertext: "\\x0908",
      p_refresh_token_nonce: `\\x${"05".repeat(12)}`,
      p_refresh_token_auth_tag: `\\x${"06".repeat(16)}`,
      p_encryption_key_version: 1,
    });
    expect(wrongAccount.error).not.toBeNull();

    const sameAccount = await admin.rpc("watchflow_upsert_google_calendar_connection", {
      p_user_id: ownerId,
      p_provider_subject: subject,
      p_display_email: "part18jd@example.invalid",
      p_granted_scopes: ["https://www.googleapis.com/auth/calendar.events"],
      p_refresh_token_ciphertext: "\\x0908",
      p_refresh_token_nonce: `\\x${"05".repeat(12)}`,
      p_refresh_token_auth_tag: `\\x${"06".repeat(16)}`,
      p_encryption_key_version: 1,
    });
    expect(sameAccount.error).toBeNull();
    expect(sameAccount.data).toBe(connectionId);

    const afterReconnect = await admin
      .from("calendar_connections")
      .select("status,sync_enabled")
      .eq("id", connectionId)
      .single();
    expect(afterReconnect.data).toEqual({ status: "disconnect_pending", sync_enabled: false });

    for (;;) {
      const rows = await claim(10);
      if (rows.length === 0) break;
      for (const row of rows) await finalize(row, "succeeded", 410);
    }

    for (const table of [
      "calendar_connections",
      "calendar_credentials",
      "calendar_event_mappings",
      "calendar_sync_jobs",
    ]) {
      const column = table === "calendar_credentials" ? "connection_id" : "connection_id";
      const result = table === "calendar_connections"
        ? await admin.from(table).select("id", { count: "exact", head: true }).eq("id", connectionId)
        : await admin.from(table).select(column, { count: "exact", head: true }).eq(column, connectionId);
      expect(result.error).toBeNull();
      expect(result.count).toBe(0);
    }
  });

  it("keeps privileged cleanup RPCs unavailable to authenticated users", async () => {
    for (const client of [owner, otherUser]) {
      const claimResult = await client.rpc("watchflow_claim_calendar_sync_jobs", {
        p_batch_size: 1,
        p_lease_seconds: 30,
      });
      const disconnectResult = await client.rpc(
        "watchflow_disconnect_google_calendar_connection",
        { p_user_id: ownerId },
      );
      const finalityResult = await client.rpc(
        "watchflow_is_final_calendar_cleanup",
        {
          p_job_id: randomUUID(),
          p_lease_token: randomUUID(),
          p_source_version: "0".repeat(32),
        },
      );
      expect(claimResult.error).not.toBeNull();
      expect(disconnectResult.error).not.toBeNull();
      expect(finalityResult.error).not.toBeNull();
    }
  });
});
