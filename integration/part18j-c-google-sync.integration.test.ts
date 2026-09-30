import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { executeCalendarSync } from "@/lib/calendar/calendar-sync-executor";
import {
  refreshGoogleCalendarAccessToken,
} from "@/lib/calendar/google-calendar-transport";
import {
  isGoogleCalendarEventDeleted,
  sameGoogleCalendarEventSecond,
} from "@/lib/calendar/google-calendar-provider-contract";
import {
  createCalendarProviderEventId,
  createCalendarSourceKey,
  createCalendarUpsertVersion,
} from "@/lib/calendar/identifiers";
import { readGoogleCalendarCredential } from "@/lib/calendar/oauth-store";
import {
  decryptCalendarRefreshToken,
  encryptCalendarRefreshToken,
} from "@/lib/calendar/token-encryption";

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
  "CALENDAR_TOKEN_ENCRYPTION_KEY",
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
] as const;

function value(name: string) {
  return process.env[name]?.trim() || null;
}

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
  process.env.RUN_PART18J_C_GOOGLE_ACCEPTANCE === "true" &&
  process.env.PART18J_C_REAL_GOOGLE_MUTATION_APPROVED === "true" &&
  process.env.E2E_TARGET_ENV === "development" &&
  requiredEnvironment.every((name) => value(name)) &&
  configuredOrigin === expectedOrigin &&
  new URL(configuredOrigin!).hostname === `${PINNED_DEVELOPMENT_REF}.supabase.co`;

const liveDescribe = enabled ? describe : describe.skip;

type QaUser = { client: SupabaseClient; userId: string };
type Connection = {
  id: string;
  user_id: string;
  provider: string;
  provider_calendar_id: string;
  sync_enabled: boolean;
  status: string;
};

const userMovieId = randomUUID();
const title = `Part 18J-C acceptance ${randomUUID()}`;
const sourceTimes = {
  initial: new Date(Date.now() + 8 * 24 * 60 * 60_000).toISOString(),
  rescheduled: new Date(Date.now() + 9 * 24 * 60 * 60_000).toISOString(),
  paused: new Date(Date.now() + 10 * 24 * 60 * 60_000).toISOString(),
};

let admin: SupabaseClient;
let userA: QaUser;
let userB: QaUser;
let connection: Connection;
let movieId: number | null = null;
let sourceKey = "";
let providerEventId = "";
let initialSyncEnabled = true;
let unrelatedConnectionHash = "";
let unrelatedConnectionBaselineCaptured = false;
let exactEventMayExist = false;
let creationSucceeded = false;
const calendarRequests: Array<{ method: string; url: string }> = [];

function hash(rows: unknown[]) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function eventTime(event: Record<string, unknown>, key: "start" | "end") {
  const value = event[key];
  expect(value).toBeTruthy();
  expect(typeof value).toBe("object");
  const time = value as { dateTime?: unknown; timeZone?: unknown };
  expect(typeof time.dateTime).toBe("string");
  expect(typeof time.timeZone).toBe("string");
  return { dateTime: time.dateTime as string, timeZone: time.timeZone as string };
}

async function authenticate(kind: "A" | "B"): Promise<QaUser> {
  const client = createClient(
    value("NEXT_PUBLIC_SUPABASE_URL")!,
    value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const signedIn = await client.auth.signInWithPassword({
    email: value(`E2E_USER_${kind}_EMAIL`)! ,
    password: value(`E2E_USER_${kind}_PASSWORD`)! ,
  });
  expect(signedIn.error).toBeNull();
  expect(signedIn.data.user).not.toBeNull();
  return { client, userId: signedIn.data.user!.id };
}

function bytea(input: Uint8Array) {
  return `\\x${Buffer.from(input).toString("hex")}`;
}

async function accessToken() {
  const credential = await readGoogleCalendarCredential(userA.userId);
  expect(credential).not.toBeNull();
  expect(credential!.connectionId).toBe(connection.id);
  const refreshToken = decryptCalendarRefreshToken(credential!, userA.userId);
  const access = await refreshGoogleCalendarAccessToken(refreshToken);
  if (access.replacementRefreshToken) {
    const encrypted = encryptCalendarRefreshToken(
      access.replacementRefreshToken,
      userA.userId,
    );
    const replaced = await admin.rpc(
      "watchflow_replace_google_calendar_credential",
      {
        p_user_id: userA.userId,
        p_connection_id: connection.id,
        p_refresh_token_ciphertext: bytea(encrypted.ciphertext),
        p_refresh_token_nonce: bytea(encrypted.nonce),
        p_refresh_token_auth_tag: bytea(encrypted.authTag),
        p_encryption_key_version: encrypted.keyVersion,
      },
    );
    expect(replaced.error).toBeNull();
    expect(replaced.data).toBe(true);
  }
  return access.accessToken;
}

function exactEventUrl() {
  return `https://www.googleapis.com/calendar/v3/calendars/primary/events/${providerEventId}`;
}

async function readExactEvent(expectedStatus = 200) {
  const response = await fetch(exactEventUrl(), {
    headers: { authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
  });
  expect(response.status).toBe(expectedStatus);
  if (expectedStatus !== 200) return null;
  const event = (await response.json()) as Record<string, unknown>;
  expect(event.id).toBe(providerEventId);
  return event;
}

async function expectExactEventDeleted() {
  const response = await fetch(exactEventUrl(), {
    headers: { authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
  });
  const event = response.status === 200
    ? (await response.json()) as Record<string, unknown>
    : null;
  if (event) expect(event.id).toBe(providerEventId);
  expect(isGoogleCalendarEventDeleted(response.status, event?.status)).toBe(true);
}

async function exactJob() {
  const result = await admin
    .from("calendar_sync_jobs")
    .select("*")
    .eq("connection_id", connection.id)
    .eq("source_key", sourceKey)
    .single();
  expect(result.error).toBeNull();
  return result.data!;
}

async function exactMapping() {
  return admin
    .from("calendar_event_mappings")
    .select("*")
    .eq("connection_id", connection.id)
    .eq("source_key", sourceKey);
}

async function setSync(enabledValue: boolean) {
  const result = await userA.client.rpc("watchflow_set_calendar_sync_enabled", {
    p_enabled: enabledValue,
  });
  expect(result.error).toBeNull();
  expect(result.data).toBe(true);
}

liveDescribe.sequential("Part 18J-C guarded real Google acceptance", () => {
  beforeAll(async () => {
    expect(configuredOrigin).toBe(`https://${PINNED_DEVELOPMENT_REF}.supabase.co`);
    expect(expectedOrigin).toBe(configuredOrigin);

    admin = createClient(
      value("NEXT_PUBLIC_SUPABASE_URL")!,
      value("SUPABASE_SECRET_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    [userA, userB] = await Promise.all([authenticate("A"), authenticate("B")]);
    expect(userA.userId).not.toBe(userB.userId);

    const connectionResult = await userA.client
      .from("calendar_connections")
      .select("id,user_id,provider,provider_calendar_id,sync_enabled,status");
    expect(connectionResult.error).toBeNull();
    expect(connectionResult.data).toHaveLength(1);
    connection = connectionResult.data![0] as Connection;
    expect(connection).toMatchObject({
      user_id: userA.userId,
      provider: "google",
      provider_calendar_id: "primary",
      status: "connected",
    });
    initialSyncEnabled = connection.sync_enabled;

    const unsafeJobs = await admin
      .from("calendar_sync_jobs")
      .select("id", { count: "exact", head: true })
      .in("state", ["pending", "retryable", "leased"]);
    expect(unsafeJobs.error).toBeNull();
    expect(
      unsafeJobs.count,
      "Acceptance refuses to claim pre-existing actionable calendar work.",
    ).toBe(0);

    const unrelated = await admin
      .from("calendar_connections")
      .select("*")
      .neq("id", connection.id)
      .order("id");
    expect(unrelated.error).toBeNull();
    unrelatedConnectionHash = hash(unrelated.data ?? []);
    unrelatedConnectionBaselineCaptured = true;

    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://www.googleapis.com/calendar/v3/")) {
        calendarRequests.push({ method: init?.method ?? "GET", url });
      }
      return originalFetch(input, init);
    });

    if (!initialSyncEnabled) await setSync(true);
  }, 30_000);

  afterAll(async () => {
    try {
      if (exactEventMayExist && providerEventId) {
        const response = await fetch(exactEventUrl(), {
          method: "DELETE",
          headers: { authorization: `Bearer ${await accessToken()}` },
        });
        expect([204, 404]).toContain(response.status);
      }
      if (connection && initialSyncEnabled !== connection.sync_enabled) {
        await setSync(initialSyncEnabled);
      } else if (connection) {
        await setSync(initialSyncEnabled);
      }
      if (connection && sourceKey) {
        const mappings = await admin
          .from("calendar_event_mappings")
          .delete()
          .eq("connection_id", connection.id)
          .eq("source_key", sourceKey);
        expect(mappings.error).toBeNull();
        const jobs = await admin
          .from("calendar_sync_jobs")
          .delete()
          .eq("connection_id", connection.id)
          .eq("source_key", sourceKey);
        expect(jobs.error).toBeNull();
      }
      const relationship = await admin.from("user_movies").delete().eq("id", userMovieId);
      expect(relationship.error).toBeNull();
      if (movieId !== null) {
        const movie = await admin.from("movies").delete().eq("id", movieId);
        expect(movie.error).toBeNull();
      }
      if (connection && unrelatedConnectionBaselineCaptured) {
        const unrelated = await admin
          .from("calendar_connections")
          .select("*")
          .neq("id", connection.id)
          .order("id");
        expect(unrelated.error).toBeNull();
        expect(hash(unrelated.data ?? [])).toBe(unrelatedConnectionHash);
      }
    } finally {
      vi.restoreAllMocks();
      await Promise.allSettled([userA?.client.auth.signOut(), userB?.client.auth.signOut()]);
    }
  }, 30_000);

  it("creates exactly one deterministic event and converges idempotently", async () => {
    const movie = await admin
      .from("movies")
      .insert({
        tmdb_id: 1_800_000_000 + Math.floor(Math.random() * 100_000_000),
        title,
        runtime_minutes: 117,
        genres: [],
        main_cast: [],
        production_countries: [],
      })
      .select("id")
      .single();
    expect(movie.error).toBeNull();
    movieId = movie.data!.id;

    const relationship = await userA.client.from("user_movies").insert({
      id: userMovieId,
      user_id: userA.userId,
      movie_id: movieId,
      status: "scheduled",
      scheduled_for: sourceTimes.initial,
      schedule_timezone: "Asia/Karachi",
    });
    expect(relationship.error).toBeNull();

    sourceKey = createCalendarSourceKey(connection.id, userMovieId);
    providerEventId = createCalendarProviderEventId(connection.id, sourceKey);
    expect(await exactJob()).toMatchObject({
      user_id: userA.userId,
      desired_operation: "upsert",
      state: "pending",
      source_version: createCalendarUpsertVersion({
        sourceKey,
        scheduledFor: sourceTimes.initial,
        scheduleTimezone: "Asia/Karachi",
        movieTitle: title,
        runtimeMinutes: 117,
      }),
    });

    const first = await executeCalendarSync();
    expect(first, `sanitized executor result: ${JSON.stringify(first)}`).toMatchObject({
      claimed: 1,
      succeeded: 1,
    });
    creationSucceeded = true;
    exactEventMayExist = true;
    const mappings = await exactMapping();
    expect(mappings.error).toBeNull();
    expect(mappings.data).toHaveLength(1);
    expect(mappings.data![0]).toMatchObject({
      user_id: userA.userId,
      provider_event_id: providerEventId,
      sync_state: "synced",
    });

    const event = await readExactEvent();
    expect(event?.summary).toBe(title);
    const initialStart = eventTime(event!, "start");
    const initialEnd = eventTime(event!, "end");
    expect(initialStart.timeZone).toBe("Asia/Karachi");
    expect(initialEnd.timeZone).toBe("Asia/Karachi");
    expect(
      sameGoogleCalendarEventSecond(sourceTimes.initial, initialStart.dateTime),
    ).toBe(true);
    expect(Date.parse(initialEnd.dateTime) - Date.parse(initialStart.dateTime)).toBe(
      117 * 60_000,
    );

    expect(await executeCalendarSync()).toMatchObject({ claimed: 0, succeeded: 0 });
    expect((await exactMapping()).data).toHaveLength(1);
    expect((await readExactEvent())?.id).toBe(providerEventId);
  }, 60_000);

  it("updates the same event and holds newest desired state while paused", async () => {
    expect(creationSucceeded).toBe(true);
    const updated = await userA.client
      .from("user_movies")
      .update({
        scheduled_for: sourceTimes.rescheduled,
        schedule_timezone: "America/Los_Angeles",
      })
      .eq("id", userMovieId);
    expect(updated.error).toBeNull();
    expect(await executeCalendarSync()).toMatchObject({ claimed: 1, succeeded: 1 });
    const rescheduled = await readExactEvent();
    expect(rescheduled?.id).toBe(providerEventId);
    const rescheduledStart = eventTime(rescheduled!, "start");
    const rescheduledEnd = eventTime(rescheduled!, "end");
    expect(rescheduledStart.timeZone).toBe("America/Los_Angeles");
    expect(rescheduledEnd.timeZone).toBe("America/Los_Angeles");
    expect(
      sameGoogleCalendarEventSecond(
        sourceTimes.rescheduled,
        rescheduledStart.dateTime,
      ),
    ).toBe(true);
    expect(
      Date.parse(rescheduledEnd.dateTime) - Date.parse(rescheduledStart.dateTime),
    ).toBe(117 * 60_000);
    expect((await exactMapping()).data).toHaveLength(1);

    await setSync(false);
    connection.sync_enabled = false;
    const beforePauseChange = JSON.stringify(await readExactEvent());
    const pausedChange = await userA.client
      .from("user_movies")
      .update({ scheduled_for: sourceTimes.paused, schedule_timezone: "UTC" })
      .eq("id", userMovieId);
    expect(pausedChange.error).toBeNull();
    expect(await exactJob()).toMatchObject({ desired_operation: "upsert", state: "pending" });
    expect(await executeCalendarSync()).toMatchObject({ claimed: 0, succeeded: 0 });
    expect(JSON.stringify(await readExactEvent())).toBe(beforePauseChange);

    await setSync(true);
    connection.sync_enabled = true;
    expect(await executeCalendarSync()).toMatchObject({ claimed: 1, succeeded: 1 });
    const resumed = await readExactEvent();
    const resumedStart = eventTime(resumed!, "start");
    const resumedEnd = eventTime(resumed!, "end");
    expect(resumedStart.timeZone).toBe("UTC");
    expect(resumedEnd.timeZone).toBe("UTC");
    expect(sameGoogleCalendarEventSecond(sourceTimes.paused, resumedStart.dateTime)).toBe(
      true,
    );
    expect(Date.parse(resumedEnd.dateTime) - Date.parse(resumedStart.dateTime)).toBe(
      117 * 60_000,
    );
  }, 60_000);

  it("enforces two-user isolation and converges an already-missing provider delete", async () => {
    expect(creationSucceeded).toBe(true);
    const [foreignConnection, foreignMapping, foreignJob] = await Promise.all([
      userB.client.from("calendar_connections").select("id").eq("id", connection.id),
      userB.client.from("calendar_event_mappings").select("id").eq("connection_id", connection.id),
      userB.client.from("calendar_sync_jobs").select("id").eq("connection_id", connection.id),
    ]);
    expect(foreignConnection.error).toBeNull();
    expect(foreignMapping.error).toBeNull();
    expect(foreignJob.error).toBeNull();
    expect(foreignConnection.data).toEqual([]);
    expect(foreignMapping.data).toEqual([]);
    expect(foreignJob.data).toEqual([]);
    const foreignCredential = await userB.client.rpc("watchflow_read_google_calendar_credential", {
      p_user_id: userA.userId,
    });
    expect(foreignCredential.error).not.toBeNull();

    const unschedule = await userA.client
      .from("user_movies")
      .update({ status: "watch_next", scheduled_for: null, schedule_timezone: null })
      .eq("id", userMovieId);
    expect(unschedule.error).toBeNull();
    expect(await exactJob()).toMatchObject({ desired_operation: "delete", state: "pending" });

    const providerDelete = await fetch(exactEventUrl(), {
      method: "DELETE",
      headers: { authorization: `Bearer ${await accessToken()}` },
    });
    expect([204, 404]).toContain(providerDelete.status);
    exactEventMayExist = false;
    const deleteResult = await executeCalendarSync();
    const finalizedDeleteJob = await exactJob();
    expect(
      deleteResult,
      `sanitized delete result: ${JSON.stringify({
        result: deleteResult,
        job: {
          state: finalizedDeleteJob.state,
          providerStatusCode: finalizedDeleteJob.provider_status_code,
          errorCode: finalizedDeleteJob.error_code,
          desiredOperation: finalizedDeleteJob.desired_operation,
        },
      })}`,
    ).toMatchObject({ claimed: 1, succeeded: 1 });
    expect(finalizedDeleteJob).toMatchObject({
      state: "succeeded",
    });
    expect([404, 410]).toContain(finalizedDeleteJob.provider_status_code);
    expect((await exactMapping()).data).toEqual([]);
    await expectExactEventDeleted();
    expect(await executeCalendarSync()).toMatchObject({ claimed: 0, succeeded: 0 });

    const calendarApiRequests = calendarRequests.filter(({ url }) =>
      url.startsWith("https://www.googleapis.com/calendar/v3/"),
    );
    expect(calendarApiRequests.length).toBeGreaterThan(0);
    for (const request of calendarApiRequests) {
      const collection = request.method === "POST" && request.url.endsWith("/calendars/primary/events");
      const exact = request.url === exactEventUrl();
      expect(collection || exact).toBe(true);
    }
  }, 60_000);
});
