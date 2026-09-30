import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createCalendarDeleteVersion,
  createCalendarProviderEventId,
  createCalendarSourceKey,
  createCalendarUpsertVersion,
} from "@/lib/calendar/identifiers";

const PINNED_DEVELOPMENT_REF = "ckwadpmvxieekjlsfcks";
const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "E2E_EXPECTED_SUPABASE_URL",
  "E2E_USER_A_EMAIL",
  "E2E_USER_A_PASSWORD",
  "E2E_USER_B_EMAIL",
  "E2E_USER_B_PASSWORD",
] as const;

function value(name: string) {
  const result = process.env[name]?.trim();
  return result ? result : null;
}

function normalizedOrigin(name: string) {
  const configured = value(name);
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

const configuredOrigin = normalizedOrigin("NEXT_PUBLIC_SUPABASE_URL");
const expectedOrigin = normalizedOrigin("E2E_EXPECTED_SUPABASE_URL");
const enabled =
  process.env.RUN_PART18J_INTEGRATION_TESTS === "true" &&
  process.env.E2E_TARGET_ENV === "development" &&
  requiredEnvironment.every((name) => value(name)) &&
  configuredOrigin === expectedOrigin &&
  new URL(configuredOrigin!).hostname ===
    `${PINNED_DEVELOPMENT_REF}.supabase.co`;
const integrationDescribe = enabled ? describe : describe.skip;

type QaUser = {
  client: SupabaseClient;
  userId: string;
};

type CalendarJob = {
  id: string;
  user_id: string;
  connection_id: string;
  source_key: string;
  user_movie_id: string | null;
  desired_operation: "upsert" | "delete" | "connection_cleanup";
  source_version: string;
  state: string;
  attempt_count: number;
  attempt_limit: number;
  available_at: string;
  lease_token: string | null;
  lease_expires_at: string | null;
  provider_status_code: number | null;
  error_code: string | null;
};

type CalendarClaim = {
  job_id: string;
  connection_id: string;
  owner_id: string;
  source_key: string;
  desired_operation: "upsert" | "delete" | "connection_cleanup";
  source_version: string;
  lease_token: string;
  provider: "google";
  provider_calendar_id: "primary";
  provider_event_id: string | null;
  user_movie_id: string | null;
  movie_id: number | null;
  movie_title: string | null;
  runtime_minutes: number | null;
  scheduled_for: string | null;
  schedule_timezone: string | null;
};

const runId = `part18j-${randomUUID()}`;
const connectionAId = randomUUID();
const connectionBId = randomUUID();
const userMovieAId = randomUUID();
const movieIds: number[] = [];
let admin: SupabaseClient;
let anon: SupabaseClient;
let userA: QaUser;
let userB: QaUser;
let preferencesA: Record<string, unknown>;
let preferencesB: Record<string, unknown>;
let scheduledFor: string;
let movieTitle: string;
let baselineConnectionHash: string;
let baselineCredentialHash: string;
let baselineConnectionCount: number;
let baselineCredentialCount: number;

function snapshotHash(rows: unknown[]) {
  return createHash("sha256")
    .update(JSON.stringify(rows), "utf8")
    .digest("hex");
}

async function authenticate(kind: "A" | "B"): Promise<QaUser> {
  const client = createClient(
    value("NEXT_PUBLIC_SUPABASE_URL")!,
    value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const result = await client.auth.signInWithPassword({
    email: value(`E2E_USER_${kind}_EMAIL`)!,
    password: value(`E2E_USER_${kind}_PASSWORD`)!,
  });
  expect(result.error).toBeNull();
  expect(result.data.user).not.toBeNull();
  return { client, userId: result.data.user!.id };
}

async function readPreferences(user: QaUser) {
  const result = await user.client
    .from("user_preferences")
    .select("*")
    .eq("user_id", user.userId)
    .single();
  expect(result.error).toBeNull();
  return result.data as Record<string, unknown>;
}

async function readFixtureJob() {
  const result = await admin
    .from("calendar_sync_jobs")
    .select("*")
    .eq("connection_id", connectionAId)
    .eq("source_key", createCalendarSourceKey(connectionAId, userMovieAId))
    .single();
  expect(result.error).toBeNull();
  return result.data as CalendarJob;
}

async function claim(batchSize = 1, leaseSeconds = 30) {
  const result = await admin.rpc("watchflow_claim_calendar_sync_jobs", {
    p_batch_size: batchSize,
    p_lease_seconds: leaseSeconds,
  });
  expect(result.error).toBeNull();
  return (result.data ?? []) as CalendarClaim[];
}

async function finalize(
  claimRow: CalendarClaim,
  options: {
    sourceVersion?: string;
    leaseToken?: string;
    outcome: string;
    providerEventId?: string | null;
    statusCode?: number | null;
    errorCode?: string | null;
  },
) {
  const result = await admin.rpc("watchflow_finalize_calendar_sync_job", {
    p_job_id: claimRow.job_id,
    p_lease_token: options.leaseToken ?? claimRow.lease_token,
    p_source_version: options.sourceVersion ?? claimRow.source_version,
    p_outcome: options.outcome,
    p_provider_event_id:
      options.providerEventId === undefined
        ? claimRow.provider_event_id
        : options.providerEventId,
    p_provider_etag: null,
    p_provider_status_code: options.statusCode ?? null,
    p_error_code: options.errorCode ?? null,
  });
  expect(result.error).toBeNull();
  return result.data as boolean;
}

async function deleteByIds(
  relation: string,
  column: string,
  ids: Array<string | number>,
) {
  if (ids.length === 0) return;
  const result = await admin.from(relation).delete().in(column, ids);
  expect(result.error).toBeNull();
}

integrationDescribe.sequential(
  "Part 18J-A guarded watchflow-dev database acceptance",
  () => {
    beforeAll(async () => {
      expect(configuredOrigin).toBe(
        `https://${PINNED_DEVELOPMENT_REF}.supabase.co`,
      );
      expect(expectedOrigin).toBe(configuredOrigin);

      admin = createClient(
        value("NEXT_PUBLIC_SUPABASE_URL")!,
        value("SUPABASE_SECRET_KEY")!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      anon = createClient(
        value("NEXT_PUBLIC_SUPABASE_URL")!,
        value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      [userA, userB] = await Promise.all([authenticate("A"), authenticate("B")]);
      expect(userA.userId).not.toBe(userB.userId);
      [preferencesA, preferencesB] = await Promise.all([
        readPreferences(userA),
        readPreferences(userB),
      ]);

      const existing = await admin
        .from("calendar_sync_jobs")
        .select("id", { count: "exact", head: true });
      expect(existing.error).toBeNull();
      expect(
        existing.count,
        "Acceptance refuses to run while any pre-existing calendar job exists.",
      ).toBe(0);

      const existingConnections = await admin
        .from("calendar_connections")
        .select("*")
        .order("id");
      expect(existingConnections.error).toBeNull();
      const existingCredentials = await admin
        .from("calendar_credentials")
        .select("*")
        .order("connection_id");
      expect(existingCredentials.error).toBeNull();
      baselineConnectionCount = existingConnections.data!.length;
      baselineCredentialCount = existingCredentials.data!.length;
      baselineConnectionHash = snapshotHash(existingConnections.data!);
      baselineCredentialHash = snapshotHash(existingCredentials.data!);
      expect(
        existingConnections.data!.filter(
          (row) => row.user_id === userA.userId || row.user_id === userB.userId,
        ),
        "QA users must not have pre-existing calendar connections.",
      ).toEqual([]);

      const connections = await admin.from("calendar_connections").insert([
        {
          id: connectionAId,
          user_id: userA.userId,
          provider_subject: `${runId}-owner-a`,
          display_email: `${runId}-a@example.invalid`,
          sync_enabled: true,
          granted_scopes: [
            "https://www.googleapis.com/auth/calendar.events",
          ],
        },
        {
          id: connectionBId,
          user_id: userB.userId,
          provider_subject: `${runId}-owner-b`,
          display_email: `${runId}-b@example.invalid`,
          sync_enabled: true,
          granted_scopes: [
            "https://www.googleapis.com/auth/calendar.events",
          ],
        },
      ]);
      expect(connections.error).toBeNull();

      const credentials = await admin.from("calendar_credentials").insert([
        {
          connection_id: connectionAId,
          refresh_token_ciphertext: "\\x01020304",
          refresh_token_nonce: "\\x000102030405060708090a0b",
          refresh_token_auth_tag: "\\x000102030405060708090a0b0c0d0e0f",
          encryption_key_version: 1,
        },
        {
          connection_id: connectionBId,
          refresh_token_ciphertext: "\\x05060708",
          refresh_token_nonce: "\\x0b0a09080706050403020100",
          refresh_token_auth_tag: "\\x0f0e0d0c0b0a09080706050403020100",
          encryption_key_version: 1,
        },
      ]);
      expect(credentials.error).toBeNull();
    }, 30_000);

    afterAll(async () => {
      if (admin) {
        await deleteByIds("calendar_connections", "id", [
          connectionAId,
          connectionBId,
        ]);
        await deleteByIds("user_movies", "id", [userMovieAId]);
        await deleteByIds("movies", "id", movieIds);

        const leftovers = await Promise.all([
          admin
            .from("calendar_connections")
            .select("id", { count: "exact", head: true })
            .in("id", [connectionAId, connectionBId]),
          admin
            .from("calendar_sync_jobs")
            .select("id", { count: "exact", head: true })
            .in("connection_id", [connectionAId, connectionBId]),
          admin
            .from("calendar_event_mappings")
            .select("id", { count: "exact", head: true })
            .in("connection_id", [connectionAId, connectionBId]),
          admin
            .from("calendar_credentials")
            .select("connection_id", { count: "exact", head: true })
            .in("connection_id", [connectionAId, connectionBId]),
        ]);
        for (const result of leftovers) {
          expect(result.error).toBeNull();
          expect(result.count).toBe(0);
        }

        expect(await readPreferences(userA)).toEqual(preferencesA);
        expect(await readPreferences(userB)).toEqual(preferencesB);

        const [connectionsAfter, credentialsAfter] = await Promise.all([
          admin.from("calendar_connections").select("*").order("id"),
          admin.from("calendar_credentials").select("*").order("connection_id"),
        ]);
        expect(connectionsAfter.error).toBeNull();
        expect(credentialsAfter.error).toBeNull();
        expect(connectionsAfter.data).toHaveLength(baselineConnectionCount);
        expect(credentialsAfter.data).toHaveLength(baselineCredentialCount);
        expect(snapshotHash(connectionsAfter.data!)).toBe(baselineConnectionHash);
        expect(snapshotHash(credentialsAfter.data!)).toBe(baselineCredentialHash);
      }
      await Promise.allSettled([
        userA?.client.auth.signOut(),
        userB?.client.auth.signOut(),
      ]);
    }, 30_000);

    it("installs the exact relations and enforces owner-safe visibility", async () => {
      const ownerA = await userA.client
        .from("calendar_connections")
        .select("id,user_id,provider,provider_calendar_id,status,sync_enabled")
        .order("id");
      const ownerB = await userB.client
        .from("calendar_connections")
        .select("id,user_id,provider,provider_calendar_id,status,sync_enabled")
        .order("id");
      expect(ownerA.error).toBeNull();
      expect(ownerB.error).toBeNull();
      expect(ownerA.data?.map((row) => row.id)).toEqual([connectionAId]);
      expect(ownerB.data?.map((row) => row.id)).toEqual([connectionBId]);
      expect(ownerA.data?.[0]).toMatchObject({
        user_id: userA.userId,
        provider: "google",
        provider_calendar_id: "primary",
        status: "connected",
        sync_enabled: true,
      });

      const anonymous = await anon.from("calendar_connections").select("id");
      expect(anonymous.error?.code).toBe("42501");

      for (const client of [anon, userA.client, userB.client]) {
        const credentialRead = await client
          .from("calendar_credentials")
          .select("connection_id");
        expect(credentialRead.error).not.toBeNull();
      }
    });

    it("denies direct provider-state writes and privileged RPCs to browser roles", async () => {
      const insert = await userA.client.from("calendar_connections").insert({
        user_id: userA.userId,
        provider_subject: `${runId}-forbidden`,
        display_email: `${runId}-forbidden@example.invalid`,
        granted_scopes: ["forbidden"],
      });
      const update = await userA.client
        .from("calendar_connections")
        .update({ sync_enabled: false })
        .eq("id", connectionAId);
      const remove = await userA.client
        .from("calendar_connections")
        .delete()
        .eq("id", connectionAId);
      expect(insert.error).not.toBeNull();
      expect(update.error).not.toBeNull();
      expect(remove.error).not.toBeNull();

      for (const client of [anon, userA.client, userB.client]) {
        const claimResult = await client.rpc(
          "watchflow_claim_calendar_sync_jobs",
          { p_batch_size: 1, p_lease_seconds: 30 },
        );
        const finalizeResult = await client.rpc(
          "watchflow_finalize_calendar_sync_job",
          {
            p_job_id: randomUUID(),
            p_lease_token: randomUUID(),
            p_source_version: "0".repeat(32),
            p_outcome: "failed",
            p_provider_event_id: null,
            p_provider_etag: null,
            p_provider_status_code: null,
            p_error_code: "forbidden",
          },
        );
        expect(claimResult.error).not.toBeNull();
        expect(finalizeResult.error).not.toBeNull();
        const replaceCredential = await client.rpc(
          "watchflow_replace_google_calendar_credential",
          {
            p_user_id: userA.userId,
            p_connection_id: connectionAId,
            p_refresh_token_ciphertext: "\\x09",
            p_refresh_token_nonce: `\\x${"00".repeat(12)}`,
            p_refresh_token_auth_tag: `\\x${"00".repeat(16)}`,
            p_encryption_key_version: 1,
          },
        );
        expect(replaceCredential.error).not.toBeNull();
        const helperResult = await client.rpc("watchflow_calendar_source_key", {
          p_connection_id: connectionAId,
          p_user_movie_id: userMovieAId,
        });
        expect(helperResult.error).not.toBeNull();
      }

      for (const rpc of [
        [
          "watchflow_calendar_source_key",
          { p_connection_id: connectionAId, p_user_movie_id: userMovieAId },
        ],
        [
          "watchflow_enqueue_calendar_sync",
          {
            p_connection_id: connectionAId,
            p_user_movie_id: userMovieAId,
            p_force_delete: false,
            p_cleanup: false,
          },
        ],
      ] as const) {
        const result = await admin.rpc(rpc[0], rpc[1]);
        expect(result.error).not.toBeNull();
      }
    });

    it("rotates only the exact encrypted credential and preserves paused metadata", async () => {
      const pause = await admin
        .from("calendar_connections")
        .update({ sync_enabled: false })
        .eq("id", connectionAId)
        .select("*")
        .single();
      expect(pause.error).toBeNull();
      const connectionHash = snapshotHash([pause.data]);

      const rotate = await admin.rpc(
        "watchflow_replace_google_calendar_credential",
        {
          p_user_id: userA.userId,
          p_connection_id: connectionAId,
          p_refresh_token_ciphertext: "\\x09080706",
          p_refresh_token_nonce: `\\x${"05".repeat(12)}`,
          p_refresh_token_auth_tag: `\\x${"04".repeat(16)}`,
          p_encryption_key_version: 2,
        },
      );
      expect(rotate.error).toBeNull();
      expect(rotate.data).toBe(true);

      const [connectionAfter, credentialAfter] = await Promise.all([
        admin.from("calendar_connections").select("*").eq("id", connectionAId).single(),
        admin
          .from("calendar_credentials")
          .select("connection_id,encryption_key_version")
          .eq("connection_id", connectionAId)
          .single(),
      ]);
      expect(connectionAfter.error).toBeNull();
      expect(credentialAfter.error).toBeNull();
      expect(snapshotHash([connectionAfter.data])).toBe(connectionHash);
      expect(connectionAfter.data?.sync_enabled).toBe(false);
      expect(credentialAfter.data).toEqual({
        connection_id: connectionAId,
        encryption_key_version: 2,
      });

      const wrongOwner = await admin.rpc(
        "watchflow_replace_google_calendar_credential",
        {
          p_user_id: userB.userId,
          p_connection_id: connectionAId,
          p_refresh_token_ciphertext: "\\x01",
          p_refresh_token_nonce: `\\x${"00".repeat(12)}`,
          p_refresh_token_auth_tag: `\\x${"00".repeat(16)}`,
          p_encryption_key_version: 1,
        },
      );
      expect(wrongOwner.error).toBeNull();
      expect(wrongOwner.data).toBe(false);

      const resume = await admin
        .from("calendar_connections")
        .update({ sync_enabled: true })
        .eq("id", connectionAId);
      expect(resume.error).toBeNull();
    });

    it("coalesces deterministic desired state and supersedes an obsolete version", async () => {
      movieTitle = `Part 18J ${runId}`;
      const movie = await admin
        .from("movies")
        .insert({
          tmdb_id: 1_700_000_000 + Math.floor(Math.random() * 100_000_000),
          title: movieTitle,
          runtime_minutes: 118,
          genres: [],
          main_cast: [],
          production_countries: [],
        })
        .select("id")
        .single();
      expect(movie.error).toBeNull();
      movieIds.push(movie.data!.id);

      scheduledFor = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
      const relationship = await admin.from("user_movies").insert({
        id: userMovieAId,
        user_id: userA.userId,
        movie_id: movie.data!.id,
        status: "scheduled",
        scheduled_for: scheduledFor,
        schedule_timezone: "Asia/Karachi",
      });
      expect(relationship.error).toBeNull();

      const first = await readFixtureJob();
      const sourceKey = createCalendarSourceKey(connectionAId, userMovieAId);
      expect(first).toMatchObject({
        user_id: userA.userId,
        connection_id: connectionAId,
        source_key: sourceKey,
        user_movie_id: userMovieAId,
        desired_operation: "upsert",
        state: "pending",
        attempt_count: 0,
        attempt_limit: 5,
      });
      expect(first.source_version).toBe(
        createCalendarUpsertVersion({
          sourceKey,
          scheduledFor,
          scheduleTimezone: "Asia/Karachi",
          movieTitle,
          runtimeMinutes: 118,
        }),
      );

      const identical = await admin
        .from("user_movies")
        .update({
          scheduled_for: scheduledFor,
          schedule_timezone: "Asia/Karachi",
        })
        .eq("id", userMovieAId)
        .eq("user_id", userA.userId);
      expect(identical.error).toBeNull();
      const afterIdentical = await readFixtureJob();
      expect(afterIdentical.id).toBe(first.id);
      expect(afterIdentical.source_version).toBe(first.source_version);

      const jobCount = await admin
        .from("calendar_sync_jobs")
        .select("id", { count: "exact", head: true })
        .eq("connection_id", connectionAId)
        .eq("source_key", sourceKey);
      expect(jobCount.error).toBeNull();
      expect(jobCount.count).toBe(1);

      const oldVersion = first.source_version;
      scheduledFor = new Date(new Date(scheduledFor).getTime() + 60 * 60_000)
        .toISOString();
      const changed = await admin
        .from("user_movies")
        .update({ scheduled_for: scheduledFor })
        .eq("id", userMovieAId)
        .eq("user_id", userA.userId);
      expect(changed.error).toBeNull();
      const afterChange = await readFixtureJob();
      expect(afterChange.id).toBe(first.id);
      expect(afterChange.source_version).not.toBe(oldVersion);
      expect(afterChange.state).toBe("pending");
      expect(afterChange.source_version).toBe(
        createCalendarUpsertVersion({
          sourceKey,
          scheduledFor,
          scheduleTimezone: "Asia/Karachi",
          movieTitle,
          runtimeMinutes: 118,
        }),
      );

      const visibleA = await userA.client
        .from("calendar_sync_jobs")
        .select("id")
        .eq("id", afterChange.id);
      const visibleB = await userB.client
        .from("calendar_sync_jobs")
        .select("id")
        .eq("id", afterChange.id);
      expect(visibleA.error).toBeNull();
      expect(visibleB.error).toBeNull();
      expect(visibleA.data).toHaveLength(1);
      expect(visibleB.data).toEqual([]);

      const pause = await admin
        .from("calendar_connections")
        .update({ sync_enabled: false })
        .eq("id", connectionAId);
      expect(pause.error).toBeNull();
      scheduledFor = new Date(
        new Date(scheduledFor).getTime() + 2 * 60 * 60_000,
      ).toISOString();
      const pausedScheduleChange = await userA.client
        .from("user_movies")
        .update({
          scheduled_for: scheduledFor,
          schedule_timezone: "Asia/Karachi",
        })
        .eq("id", userMovieAId);
      expect(pausedScheduleChange.error).toBeNull();
      expect(await readFixtureJob()).toMatchObject({
        desired_operation: "upsert",
        source_version: createCalendarUpsertVersion({
          sourceKey,
          scheduledFor,
          scheduleTimezone: "Asia/Karachi",
          movieTitle,
          runtimeMinutes: 118,
        }),
        state: "pending",
      });
      expect(await claim()).toEqual([]);
      const resume = await admin
        .from("calendar_connections")
        .update({ sync_enabled: true })
        .eq("id", connectionAId);
      expect(resume.error).toBeNull();
    });

    it("enforces bounded exclusive claims, lease recovery, and exact finalization", async () => {
      for (const [batchSize, leaseSeconds] of [
        [0, 30],
        [26, 30],
        [1, 29],
        [1, 301],
      ]) {
        const invalid = await admin.rpc("watchflow_claim_calendar_sync_jobs", {
          p_batch_size: batchSize,
          p_lease_seconds: leaseSeconds,
        });
        expect(invalid.error).not.toBeNull();
      }

      const concurrent = await Promise.all([claim(), claim()]);
      const claimed = concurrent.flat();
      expect(claimed).toHaveLength(1);
      const firstClaim = claimed[0];
      expect(firstClaim).toMatchObject({
        connection_id: connectionAId,
        owner_id: userA.userId,
        desired_operation: "upsert",
        provider: "google",
        provider_calendar_id: "primary",
        user_movie_id: userMovieAId,
        movie_title: movieTitle,
        runtime_minutes: 118,
        schedule_timezone: "Asia/Karachi",
      });
      expect(new Date(firstClaim.scheduled_for!).getTime()).toBe(
        new Date(scheduledFor).getTime(),
      );
      expect(firstClaim.provider_event_id).toBe(
        createCalendarProviderEventId(connectionAId, firstClaim.source_key),
      );

      const expire = await admin
        .from("calendar_sync_jobs")
        .update({ lease_expires_at: new Date(Date.now() - 1_000).toISOString() })
        .eq("id", firstClaim.job_id)
        .eq("lease_token", firstClaim.lease_token);
      expect(expire.error).toBeNull();
      const reclaimed = await claim();
      expect(reclaimed).toHaveLength(1);
      expect(reclaimed[0].job_id).toBe(firstClaim.job_id);
      expect(reclaimed[0].lease_token).not.toBe(firstClaim.lease_token);

      expect(
        await finalize(firstClaim, {
          outcome: "succeeded",
          providerEventId: firstClaim.provider_event_id,
          statusCode: 200,
        }),
      ).toBe(false);
      expect(
        await finalize(reclaimed[0], {
          sourceVersion: createCalendarDeleteVersion(reclaimed[0].source_key),
          outcome: "succeeded",
          providerEventId: reclaimed[0].provider_event_id,
          statusCode: 200,
        }),
      ).toBe(false);

      expect(
        await finalize(reclaimed[0], {
          outcome: "retryable",
          providerEventId: null,
          statusCode: 503,
          errorCode: "calendar_provider_unavailable",
        }),
      ).toBe(true);
      const retryable = await readFixtureJob();
      expect(retryable).toMatchObject({
        state: "retryable",
        attempt_count: 2,
        provider_status_code: 503,
        error_code: "calendar_provider_unavailable",
      });
      expect(new Date(retryable.available_at).getTime()).toBeGreaterThan(
        Date.now(),
      );

      const makeDue = await admin
        .from("calendar_sync_jobs")
        .update({ available_at: new Date(Date.now() - 1_000).toISOString() })
        .eq("id", retryable.id)
        .eq("state", "retryable");
      expect(makeDue.error).toBeNull();
      const finalClaim = await claim();
      expect(finalClaim).toHaveLength(1);
      expect(
        await finalize(finalClaim[0], {
          outcome: "succeeded",
          statusCode: 200,
        }),
      ).toBe(true);
      const succeeded = await readFixtureJob();
      expect(succeeded).toMatchObject({
        state: "succeeded",
        attempt_count: 3,
        provider_status_code: 200,
        lease_token: null,
        lease_expires_at: null,
      });
    });

    it("protects terminal work and cleans the deterministic deletion tombstone", async () => {
      const sourceKey = createCalendarSourceKey(connectionAId, userMovieAId);
      const mapping = await admin
        .from("calendar_event_mappings")
        .select("*")
        .eq("connection_id", connectionAId)
        .eq("source_key", sourceKey)
        .single();
      expect(mapping.error).toBeNull();
      expect(mapping.data).toMatchObject({
        user_id: userA.userId,
        user_movie_id: userMovieAId,
        provider_calendar_id: "primary",
        provider_event_id: createCalendarProviderEventId(
          connectionAId,
          sourceKey,
        ),
      });

      const identical = await admin
        .from("user_movies")
        .update({ scheduled_for: scheduledFor })
        .eq("id", userMovieAId)
        .eq("user_id", userA.userId);
      expect(identical.error).toBeNull();
      expect(await readFixtureJob()).toMatchObject({ state: "succeeded" });
      expect(await claim()).toEqual([]);

      const removeRelationship = await admin
        .from("user_movies")
        .delete()
        .eq("id", userMovieAId)
        .eq("user_id", userA.userId);
      expect(removeRelationship.error).toBeNull();
      const tombstone = await readFixtureJob();
      expect(tombstone).toMatchObject({
        desired_operation: "delete",
        source_version: createCalendarDeleteVersion(sourceKey),
        state: "pending",
        user_movie_id: null,
      });

      const preservedMapping = await admin
        .from("calendar_event_mappings")
        .select("source_key,user_movie_id,provider_event_id")
        .eq("connection_id", connectionAId)
        .eq("source_key", sourceKey)
        .single();
      expect(preservedMapping.error).toBeNull();
      expect(preservedMapping.data).toEqual({
        source_key: sourceKey,
        user_movie_id: null,
        provider_event_id: createCalendarProviderEventId(
          connectionAId,
          sourceKey,
        ),
      });

      const deletionClaim = await claim();
      expect(deletionClaim).toHaveLength(1);
      expect(deletionClaim[0]).toMatchObject({
        desired_operation: "delete",
        source_key: sourceKey,
        provider_event_id: preservedMapping.data!.provider_event_id,
        user_movie_id: null,
      });
      expect(
        await finalize(deletionClaim[0], {
          outcome: "succeeded",
          providerEventId: null,
          statusCode: 204,
        }),
      ).toBe(true);

      const absentMapping = await admin
        .from("calendar_event_mappings")
        .select("id", { count: "exact", head: true })
        .eq("connection_id", connectionAId)
        .eq("source_key", sourceKey);
      expect(absentMapping.error).toBeNull();
      expect(absentMapping.count).toBe(0);
      expect(await readFixtureJob()).toMatchObject({ state: "succeeded" });

      const userBMapping = await userB.client
        .from("calendar_event_mappings")
        .select("id")
        .eq("connection_id", connectionAId);
      expect(userBMapping.error).toBeNull();
      expect(userBMapping.data).toEqual([]);
    });
  },
);
