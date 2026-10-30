import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DEVELOPMENT_REF = "ckwadpmvxieekjlsfcks";
const value = (name: string) => process.env[name]?.trim() || null;

function origin(name: string) {
  try {
    return new URL(value(name) ?? "").origin;
  } catch {
    return null;
  }
}

const configuredOrigin = origin("NEXT_PUBLIC_SUPABASE_URL");
const enabled =
  process.env.RUN_PART18J_REAUTH_INTEGRATION_TESTS === "true" &&
  process.env.E2E_TARGET_ENV === "development" &&
  configuredOrigin === `https://${DEVELOPMENT_REF}.supabase.co` &&
  origin("E2E_EXPECTED_SUPABASE_URL") === configuredOrigin &&
  process.env.E2E_EXPECTED_SUPABASE_PROJECT_REF === DEVELOPMENT_REF &&
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"].every(value);

const liveDescribe = enabled ? describe : describe.skip;

liveDescribe.sequential("Part 18J same-subject reauthorization", () => {
  const initialSubject = `part18j-reauth-${randomUUID()}`;
  const replacementSubject = `part18j-reauth-${randomUUID()}`;
  const sourceKey = randomBytes(16).toString("hex");
  const sourceVersion = randomBytes(16).toString("hex");
  const jobId = randomUUID();
  const cleanupJobId = randomUUID();
  const scopes = ["https://www.googleapis.com/auth/calendar.events"];
  let admin: SupabaseClient;
  let owner: SupabaseClient;
  let ownerId = "";
  let connectionId = "";

  function credential(marker: number) {
    const hex = marker.toString(16).padStart(2, "0");
    return {
      p_refresh_token_ciphertext: `\\x${hex.repeat(2)}`,
      p_refresh_token_nonce: `\\x${hex.repeat(12)}`,
      p_refresh_token_auth_tag: `\\x${hex.repeat(16)}`,
      p_encryption_key_version: 1,
    };
  }

  async function upsert(subject: string | null, marker: number) {
    return admin.rpc("watchflow_upsert_google_calendar_connection", {
      p_user_id: ownerId,
      p_provider_subject: subject,
      p_display_email: "reauth-fixture@example.invalid",
      p_granted_scopes: scopes,
      ...credential(marker),
    });
  }

  async function readConnection() {
    const result = await admin.from("calendar_connections")
      .select("id,user_id,provider,provider_subject,status,sync_enabled,display_email,granted_scopes,connected_at,updated_at,last_error_code,last_error_at")
      .eq("id", connectionId).single();
    expect(result.error).toBeNull();
    return result.data!;
  }

  async function readCredential() {
    const result = await admin.from("calendar_credentials")
      .select("connection_id,refresh_token_ciphertext,refresh_token_nonce,refresh_token_auth_tag,encryption_key_version,created_at,updated_at")
      .eq("connection_id", connectionId).single();
    expect(result.error).toBeNull();
    return result.data!;
  }

  async function readJob() {
    const result = await admin.from("calendar_sync_jobs")
      .select("id,user_id,connection_id,source_key,source_version,desired_operation,state,attempt_count,lease_token,lease_expires_at")
      .eq("id", jobId).single();
    expect(result.error).toBeNull();
    return result.data!;
  }

  async function readCleanupJob() {
    const result = await admin.from("calendar_sync_jobs")
      .select("id,state,attempt_count,available_at,lease_token,lease_expires_at,provider_status_code,error_code,completed_at")
      .eq("id", cleanupJobId).single();
    expect(result.error).toBeNull();
    return result.data!;
  }

  async function readWorkCounts() {
    const [jobs, mappings] = await Promise.all([
      admin.from("calendar_sync_jobs").select("id", { count: "exact", head: true })
        .eq("connection_id", connectionId),
      admin.from("calendar_event_mappings").select("id", { count: "exact", head: true })
        .eq("connection_id", connectionId),
    ]);
    expect(jobs.error).toBeNull();
    expect(mappings.error).toBeNull();
    return { jobs: jobs.count, mappings: mappings.count };
  }

  beforeAll(async () => {
    expect(configuredOrigin).toBe(`https://${DEVELOPMENT_REF}.supabase.co`);
    admin = createClient(configuredOrigin!, value("SUPABASE_SECRET_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const password = `Part18JReauth-${randomUUID()}-Aa1!`;
    const created = await admin.auth.admin.createUser({
      email: `part18j-reauth-${randomUUID()}@example.invalid`,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    ownerId = created.data.user!.id;
    owner = createClient(configuredOrigin!, value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await owner.auth.signInWithPassword({
      email: created.data.user!.email!, password,
    });
    expect(signIn.error).toBeNull();
    expect(signIn.data.user?.id).toBe(ownerId);
  }, 30_000);

  afterAll(async () => {
    if (admin && ownerId) await admin.auth.admin.deleteUser(ownerId);
    if (owner) await owner.auth.signOut();
  }, 30_000);

  it("rejects null and empty subjects before creating a first connection", async () => {
    for (const subject of [null, ""]) {
      const rejected = await upsert(subject, 8);
      expect(rejected.error).not.toBeNull();
    }
    const [connections, jobs, mappings] = await Promise.all([
      admin.from("calendar_connections").select("id", { count: "exact", head: true })
        .eq("user_id", ownerId).eq("provider", "google"),
      admin.from("calendar_sync_jobs").select("id", { count: "exact", head: true })
        .eq("user_id", ownerId),
      admin.from("calendar_event_mappings").select("id", { count: "exact", head: true })
        .eq("user_id", ownerId),
    ]);
    for (const result of [connections, jobs, mappings]) {
      expect(result.error).toBeNull();
    }
    expect(connections.count).toBe(0);
    expect(jobs.count).toBe(0);
    expect(mappings.count).toBe(0);
  });

  it("keeps first connection enabled and the upsert RPC service-role-only", async () => {
    const forbidden = await owner.rpc("watchflow_upsert_google_calendar_connection", {
      p_user_id: ownerId,
      p_provider_subject: initialSubject,
      p_display_email: "reauth-fixture@example.invalid",
      p_granted_scopes: scopes,
      ...credential(1),
    });
    expect(forbidden.error).not.toBeNull();

    const first = await upsert(initialSubject, 1);
    expect(first.error).toBeNull();
    connectionId = first.data as string;
    const [connection, stored, work] = await Promise.all([
      readConnection(), readCredential(), readWorkCounts(),
    ]);
    expect(connection).toMatchObject({
      id: connectionId, user_id: ownerId, provider: "google",
      provider_subject: initialSubject, status: "connected", sync_enabled: true,
    });
    expect(stored).toMatchObject({
      connection_id: connectionId,
      refresh_token_ciphertext: credential(1).p_refresh_token_ciphertext,
    });
    expect(work).toEqual({ jobs: 0, mappings: 0 });
  });

  it("preserves a paused connected account and its exact pending upsert", async () => {
    const paused = await owner.rpc("watchflow_set_calendar_sync_enabled", { p_enabled: false });
    expect(paused.error).toBeNull();
    expect(paused.data).toBe(true);
    const inserted = await admin.from("calendar_sync_jobs").insert({
      id: jobId, user_id: ownerId, connection_id: connectionId,
      source_key: sourceKey, source_version: sourceVersion,
      desired_operation: "upsert", state: "pending", attempt_count: 0,
    });
    expect(inserted.error).toBeNull();
    const beforeJob = await readJob();
    const beforeCredential = await readCredential();

    const reauthorized = await upsert(initialSubject, 2);
    expect(reauthorized.error).toBeNull();
    expect(reauthorized.data).toBe(connectionId);
    const [connection, stored, afterJob, work] = await Promise.all([
      readConnection(), readCredential(), readJob(), readWorkCounts(),
    ]);
    expect(connection).toMatchObject({
      id: connectionId, provider_subject: initialSubject,
      status: "connected", sync_enabled: false,
    });
    expect(stored.connection_id).toBe(connectionId);
    expect(stored.refresh_token_ciphertext).toBe(credential(2).p_refresh_token_ciphertext);
    expect(stored.refresh_token_ciphertext).not.toBe(beforeCredential.refresh_token_ciphertext);
    expect(afterJob).toEqual(beforeJob);
    expect(afterJob).toMatchObject({
      id: jobId, source_key: sourceKey, source_version: sourceVersion,
      desired_operation: "upsert", state: "pending", attempt_count: 0,
      lease_token: null, lease_expires_at: null,
    });
    expect(work).toEqual({ jobs: 1, mappings: 0 });
  });

  it("rejects a null subject while paused without changing credential or work", async () => {
    const before = await Promise.all([
      readConnection(), readCredential(), readJob(), readWorkCounts(),
    ]);
    expect(before[0]).toMatchObject({ status: "connected", sync_enabled: false });
    const rejected = await upsert(null, 9);
    expect(rejected.error).not.toBeNull();
    expect(await Promise.all([
      readConnection(), readCredential(), readJob(), readWorkCounts(),
    ])).toEqual(before);
  });

  it("preserves an enabled connected account on same-subject reauthorization", async () => {
    const enabledResult = await owner.rpc("watchflow_set_calendar_sync_enabled", { p_enabled: true });
    expect(enabledResult.error).toBeNull();
    expect(enabledResult.data).toBe(true);
    const reauthorized = await upsert(initialSubject, 3);
    expect(reauthorized.error).toBeNull();
    expect(reauthorized.data).toBe(connectionId);
    expect(await readConnection()).toMatchObject({
      id: connectionId, provider_subject: initialSubject,
      status: "connected", sync_enabled: true,
    });
    expect(await readWorkCounts()).toEqual({ jobs: 1, mappings: 0 });
  });

  it("rejects a null subject while enabled without changing credential or work", async () => {
    const before = await Promise.all([
      readConnection(), readCredential(), readJob(), readWorkCounts(),
    ]);
    expect(before[0]).toMatchObject({ status: "connected", sync_enabled: true });
    const rejected = await upsert(null, 10);
    expect(rejected.error).not.toBeNull();
    expect(await Promise.all([
      readConnection(), readCredential(), readJob(), readWorkCounts(),
    ])).toEqual(before);
  });

  it("rejects a different subject without changing connection, credential, or work", async () => {
    const paused = await owner.rpc("watchflow_set_calendar_sync_enabled", { p_enabled: false });
    expect(paused.error).toBeNull();
    const before = await Promise.all([
      readConnection(), readCredential(), readJob(), readWorkCounts(),
    ]);
    const rejected = await upsert(replacementSubject, 4);
    expect(rejected.error).not.toBeNull();
    const after = await Promise.all([
      readConnection(), readCredential(), readJob(), readWorkCounts(),
    ]);
    expect(after).toEqual(before);
    expect(after[0]).toMatchObject({ sync_enabled: false, provider_subject: initialSubject });
  });

  it("preserves reconnect-required recovery behavior", async () => {
    const marked = await admin.from("calendar_connections")
      .update({ status: "reconnect_required", sync_enabled: false })
      .eq("id", connectionId);
    expect(marked.error).toBeNull();
    const reauthorized = await upsert(replacementSubject, 5);
    expect(reauthorized.error).toBeNull();
    expect(reauthorized.data).toBe(connectionId);
    expect(await readConnection()).toMatchObject({
      id: connectionId, provider_subject: replacementSubject,
      status: "connected", sync_enabled: true,
    });
    expect(await readWorkCounts()).toEqual({ jobs: 1, mappings: 0 });
  });

  it("preserves disconnect-pending same-subject cleanup behavior", async () => {
    const marked = await admin.from("calendar_connections")
      .update({ status: "disconnect_pending", sync_enabled: false })
      .eq("id", connectionId);
    expect(marked.error).toBeNull();
    const cleanup = await admin.from("calendar_sync_jobs").insert({
      id: cleanupJobId, user_id: ownerId, connection_id: connectionId,
      source_key: randomBytes(16).toString("hex"),
      source_version: randomBytes(16).toString("hex"),
      desired_operation: "connection_cleanup", state: "auth_required",
      attempt_count: 1,
    });
    expect(cleanup.error).toBeNull();

    const before = await Promise.all([
      readConnection(), readCredential(), readJob(), readCleanupJob(), readWorkCounts(),
    ]);
    const nullSubject = await upsert(null, 11);
    expect(nullSubject.error).not.toBeNull();
    expect(await Promise.all([
      readConnection(), readCredential(), readJob(), readCleanupJob(), readWorkCounts(),
    ])).toEqual(before);

    const rejected = await upsert(initialSubject, 6);
    expect(rejected.error).not.toBeNull();
    expect(await Promise.all([
      readConnection(), readCredential(), readJob(), readCleanupJob(), readWorkCounts(),
    ])).toEqual(before);

    const reauthorized = await upsert(replacementSubject, 7);
    expect(reauthorized.error).toBeNull();
    expect(reauthorized.data).toBe(connectionId);
    const cleanupAfter = await admin.from("calendar_sync_jobs")
      .select("state,attempt_count,lease_token,lease_expires_at")
      .eq("id", cleanupJobId).single();
    expect(cleanupAfter.error).toBeNull();
    expect(cleanupAfter.data).toEqual({
      state: "pending", attempt_count: 0,
      lease_token: null, lease_expires_at: null,
    });
    expect(await readConnection()).toMatchObject({
      id: connectionId, provider_subject: replacementSubject,
      status: "disconnect_pending", sync_enabled: false,
    });
    expect((await readCredential()).refresh_token_ciphertext)
      .toBe(credential(7).p_refresh_token_ciphertext);
    expect(await readWorkCounts()).toEqual({ jobs: 2, mappings: 0 });
  });
});
