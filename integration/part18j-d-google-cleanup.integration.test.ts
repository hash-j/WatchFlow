import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { executeCalendarSync } from "@/lib/calendar/calendar-sync-executor";
import {
  isGoogleCalendarEventDeleted,
} from "@/lib/calendar/google-calendar-provider-contract";
import { refreshGoogleCalendarAccessToken } from "@/lib/calendar/google-calendar-transport";
import { readGoogleCalendarCredential } from "@/lib/calendar/oauth-store";
import {
  decryptCalendarRefreshToken,
  encryptCalendarRefreshToken,
} from "@/lib/calendar/token-encryption";

const PINNED_DEVELOPMENT_REF = "ckwadpmvxieekjlsfcks";
const value = (name: string) => process.env[name]?.trim() || null;

type Fixture = {
  scenario: string;
  title: string;
  userMovieId: string;
  movieId: number;
  sourceKey: string;
  providerEventId: string;
};

type Manifest = {
  target: string;
  projectRef: string;
  runId: string;
  connectionId: string;
  providerMutationsApproved: boolean;
  fixtures: Fixture[];
};

const manifest = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "qa-artifacts/part18jd-acceptance-manifest.json"),
    "utf8",
  ),
) as Manifest;

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
  process.env.RUN_PART18J_D_GOOGLE_ACCEPTANCE === "true" &&
  process.env.PART18J_D_REAL_GOOGLE_MUTATION_APPROVED === "true" &&
  process.env.E2E_TARGET_ENV === "development" &&
  configuredOrigin === expectedOrigin &&
  configuredOrigin !== null &&
  new URL(configuredOrigin).hostname === `${PINNED_DEVELOPMENT_REF}.supabase.co` &&
  manifest.target === "watchflow-dev" &&
  manifest.projectRef === PINNED_DEVELOPMENT_REF &&
  [
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "E2E_USER_A_EMAIL",
    "E2E_USER_A_PASSWORD",
    "E2E_USER_B_EMAIL",
    "E2E_USER_B_PASSWORD",
    "CALENDAR_TOKEN_ENCRYPTION_KEY",
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
  ].every((name) => value(name));

const liveDescribe = enabled ? describe : describe.skip;

function bytea(input: Uint8Array) {
  return `\\x${Buffer.from(input).toString("hex")}`;
}

function snapshotHash(valueToHash: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(valueToHash))
    .digest("hex");
}

liveDescribe.sequential("Part 18J-D guarded real Google cleanup", () => {
  let admin: SupabaseClient;
  let userA: SupabaseClient;
  let userB: SupabaseClient;
  let userAId = "";
  let initialConnection: Record<string, unknown> | null = null;
  let unrelatedConnectionHash = "";
  let connectionDeleted = false;
  const googleRequests: Array<{ method: string; url: string; status: number }> = [];

  async function accessToken() {
    const credential = await readGoogleCalendarCredential(userAId);
    if (!credential) return null;
    const refreshToken = decryptCalendarRefreshToken(credential, userAId);
    const access = await refreshGoogleCalendarAccessToken(refreshToken);
    if (access.replacementRefreshToken) {
      const encrypted = encryptCalendarRefreshToken(
        access.replacementRefreshToken,
        userAId,
      );
      const rotated = await admin.rpc(
        "watchflow_replace_google_calendar_credential",
        {
          p_user_id: userAId,
          p_connection_id: manifest.connectionId,
          p_refresh_token_ciphertext: bytea(encrypted.ciphertext),
          p_refresh_token_nonce: bytea(encrypted.nonce),
          p_refresh_token_auth_tag: bytea(encrypted.authTag),
          p_encryption_key_version: encrypted.keyVersion,
        },
      );
      expect(rotated.error).toBeNull();
      expect(rotated.data).toBe(true);
    }
    return access.accessToken;
  }

  function eventUrl(fixture: Fixture) {
    return `https://www.googleapis.com/calendar/v3/calendars/primary/events/${fixture.providerEventId}`;
  }

  async function exactEvent(fixture: Fixture) {
    const token = await accessToken();
    expect(token).not.toBeNull();
    const response = await fetch(eventUrl(fixture), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const event = response.status === 200
      ? (await response.json()) as Record<string, unknown>
      : null;
    if (event) expect(event.id).toBe(fixture.providerEventId);
    return { response, event };
  }

  beforeAll(async () => {
    expect(manifest.providerMutationsApproved).toBe(false);
    expect(manifest.fixtures).toHaveLength(3);
    expect(configuredOrigin).toBe(`https://${PINNED_DEVELOPMENT_REF}.supabase.co`);
    expect(expectedOrigin).toBe(configuredOrigin);

    admin = createClient(configuredOrigin!, value("SUPABASE_SECRET_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    userA = createClient(
      configuredOrigin!,
      value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    userB = createClient(
      configuredOrigin!,
      value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const [a, b] = await Promise.all([
      userA.auth.signInWithPassword({
        email: value("E2E_USER_A_EMAIL")!,
        password: value("E2E_USER_A_PASSWORD")!,
      }),
      userB.auth.signInWithPassword({
        email: value("E2E_USER_B_EMAIL")!,
        password: value("E2E_USER_B_PASSWORD")!,
      }),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    userAId = a.data.user!.id;
    expect(userAId).not.toBe(b.data.user!.id);

    const connection = await userA
      .from("calendar_connections")
      .select("*")
      .eq("id", manifest.connectionId)
      .eq("user_id", userAId)
      .single();
    expect(connection.error).toBeNull();
    expect(connection.data).toMatchObject({
      status: "connected",
      sync_enabled: true,
      provider: "google",
      provider_calendar_id: "primary",
    });
    initialConnection = connection.data;

    const actionable = await admin
      .from("calendar_sync_jobs")
      .select("id,source_key,state")
      .in("state", ["pending", "retryable", "leased"]);
    expect(actionable.error).toBeNull();
    expect(actionable.data).toHaveLength(3);
    expect(
      actionable.data!.map((job) => job.source_key).sort(),
    ).toEqual(manifest.fixtures.map((fixture) => fixture.sourceKey).sort());

    const unrelated = await admin
      .from("calendar_connections")
      .select("*")
      .neq("id", manifest.connectionId)
      .order("id");
    expect(unrelated.error).toBeNull();
    unrelatedConnectionHash = snapshotHash(unrelated.data ?? []);

    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      const response = await originalFetch(input, init);
      if (url.startsWith("https://www.googleapis.com/calendar/v3/")) {
        googleRequests.push({
          method: init?.method ?? "GET",
          url,
          status: response.status,
        });
      }
      return response;
    });
  }, 30_000);

  afterAll(async () => {
    try {
      if (!connectionDeleted) {
        try {
          const token = await accessToken();
          if (token) {
            for (const fixture of manifest.fixtures) {
              await fetch(eventUrl(fixture), {
                method: "DELETE",
                headers: { authorization: `Bearer ${token}` },
              });
            }
          }
        } catch {
          // Keep the exact database fixture state for diagnosis if provider cleanup failed.
        }
        await admin
          .from("calendar_event_mappings")
          .delete()
          .eq("connection_id", manifest.connectionId)
          .in("source_key", manifest.fixtures.map((fixture) => fixture.sourceKey));
        await admin
          .from("calendar_sync_jobs")
          .delete()
          .eq("connection_id", manifest.connectionId)
          .in("source_key", manifest.fixtures.map((fixture) => fixture.sourceKey));
        if (initialConnection) {
          await admin
            .from("calendar_connections")
            .update({
              status: initialConnection.status,
              sync_enabled: initialConnection.sync_enabled,
              last_error_code: initialConnection.last_error_code,
              last_error_at: initialConnection.last_error_at,
            })
            .eq("id", manifest.connectionId)
            .eq("user_id", userAId);
        }
      }

      await admin
        .from("user_movies")
        .delete()
        .in("id", manifest.fixtures.map((fixture) => fixture.userMovieId));
      await admin
        .from("movies")
        .delete()
        .in("id", manifest.fixtures.map((fixture) => fixture.movieId));
    } finally {
      vi.restoreAllMocks();
      await Promise.allSettled([userA?.auth.signOut(), userB?.auth.signOut()]);
    }
  }, 30_000);

  it("creates only the three deterministic controlled events", async () => {
    const execution = await executeCalendarSync(3);
    expect(execution).toMatchObject({ claimed: 3, succeeded: 3 });
    expect(execution.retryable).toBe(0);
    expect(execution.failed).toBe(0);
    expect(execution.authRequired).toBe(0);

    const mappings = await admin
      .from("calendar_event_mappings")
      .select("source_key,provider_event_id,sync_state")
      .eq("connection_id", manifest.connectionId)
      .in("source_key", manifest.fixtures.map((fixture) => fixture.sourceKey));
    expect(mappings.error).toBeNull();
    expect(mappings.data).toHaveLength(3);
    for (const fixture of manifest.fixtures) {
      expect(mappings.data).toContainEqual({
        source_key: fixture.sourceKey,
        provider_event_id: fixture.providerEventId,
        sync_state: "synced",
      });
      const { response, event } = await exactEvent(fixture);
      expect(response.status).toBe(200);
      expect(event?.summary).toBe(fixture.title);
    }
    expect(await executeCalendarSync(3)).toMatchObject({ claimed: 0 });
  }, 60_000);

  it("establishes one exact already-missing provider event", async () => {
    const fixture = manifest.fixtures.find(
      (candidate) => candidate.scenario === "already_missing_cleanup",
    )!;
    const token = await accessToken();
    expect(token).not.toBeNull();
    const removed = await fetch(eventUrl(fixture), {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    expect([204, 404, 410]).toContain(removed.status);
    const { response, event } = await exactEvent(fixture);
    expect(
      isGoogleCalendarEventDeleted(response.status, event?.status),
    ).toBe(true);
  }, 30_000);

  it("reconciles exact cleanup serially and removes final local authorization", async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const requested = await admin.rpc(
        "watchflow_disconnect_google_calendar_connection",
        { p_user_id: userAId },
      );
      expect(requested.error).toBeNull();
      expect(requested.data).toBe(true);
    }

    const [pendingConnection, credential, jobs, mappings, foreignJobs] =
      await Promise.all([
        admin
          .from("calendar_connections")
          .select("status,sync_enabled")
          .eq("id", manifest.connectionId)
          .single(),
        admin
          .from("calendar_credentials")
          .select("connection_id")
          .eq("connection_id", manifest.connectionId)
          .single(),
        admin
          .from("calendar_sync_jobs")
          .select("source_key,desired_operation,state")
          .eq("connection_id", manifest.connectionId),
        admin
          .from("calendar_event_mappings")
          .select("source_key,sync_state")
          .eq("connection_id", manifest.connectionId),
        userB
          .from("calendar_sync_jobs")
          .select("source_key")
          .eq("connection_id", manifest.connectionId),
      ]);
    expect(pendingConnection.data).toEqual({
      status: "disconnect_pending",
      sync_enabled: false,
    });
    expect(credential.error).toBeNull();
    expect(jobs.data).toHaveLength(3);
    expect(
      jobs.data!.every(
        (job) =>
          job.desired_operation === "connection_cleanup" &&
          job.state === "pending",
      ),
    ).toBe(true);
    expect(mappings.data).toHaveLength(3);
    expect(mappings.data!.every((mapping) => mapping.sync_state === "delete_pending")).toBe(true);
    expect(foreignJobs.data).toEqual([]);

    for (const expectedRemaining of [2, 1, 0]) {
      const result = await executeCalendarSync(1);
      expect(result).toMatchObject({ claimed: 1, succeeded: 1 });
      const remaining = await admin
        .from("calendar_event_mappings")
        .select("id", { count: "exact", head: true })
        .eq("connection_id", manifest.connectionId);
      expect(remaining.error).toBeNull();
      expect(remaining.count).toBe(expectedRemaining);
      if (expectedRemaining > 0) {
        const stillConnected = await admin
          .from("calendar_connections")
          .select("status")
          .eq("id", manifest.connectionId)
          .single();
        expect(stillConnected.data?.status).toBe("disconnect_pending");
        const retainedCredential = await admin
          .from("calendar_credentials")
          .select("connection_id")
          .eq("connection_id", manifest.connectionId)
          .single();
        expect(retainedCredential.error).toBeNull();
      }
    }

    connectionDeleted = true;
    for (const [table, column] of [
      ["calendar_connections", "id"],
      ["calendar_credentials", "connection_id"],
      ["calendar_event_mappings", "connection_id"],
      ["calendar_sync_jobs", "connection_id"],
    ] as const) {
      const result = await admin
        .from(table)
        .select(column, { count: "exact", head: true })
        .eq(column, manifest.connectionId);
      expect(result.error).toBeNull();
      expect(result.count).toBe(0);
    }
    expect(await executeCalendarSync(3)).toMatchObject({ claimed: 0 });

    const unrelated = await admin
      .from("calendar_connections")
      .select("*")
      .neq("id", manifest.connectionId)
      .order("id");
    expect(unrelated.error).toBeNull();
    expect(snapshotHash(unrelated.data ?? [])).toBe(unrelatedConnectionHash);

    const calendarRequests = googleRequests.filter(({ url }) =>
      url.startsWith("https://www.googleapis.com/calendar/v3/"),
    );
    const exactUrls = new Set(manifest.fixtures.map(eventUrl));
    for (const request of calendarRequests) {
      const allowedCreate =
        request.method === "POST" &&
        request.url ===
          "https://www.googleapis.com/calendar/v3/calendars/primary/events";
      expect(allowedCreate || exactUrls.has(request.url)).toBe(true);
      expect(request.url).not.toContain("events?");
    }
    for (const fixture of manifest.fixtures) {
      expect(
        calendarRequests.some(
          (request) =>
            request.method === "DELETE" && request.url === eventUrl(fixture),
        ),
      ).toBe(true);
    }
  }, 90_000);
});
