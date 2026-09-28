import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

const enabled =
  process.env.RUN_PART18I_INTEGRATION_TESTS === "true" &&
  process.env.E2E_TARGET_ENV === "development" &&
  requiredEnvironment.every((name) => value(name)) &&
  value("NEXT_PUBLIC_SUPABASE_URL")!.replace(/\/$/, "") ===
    value("E2E_EXPECTED_SUPABASE_URL")!.replace(/\/$/, "");
const integrationDescribe = enabled ? describe : describe.skip;

type QaUser = { client: SupabaseClient; userId: string };
type Preferences = {
  schedule_reminders_enabled: boolean;
  reminder_offset_minutes: number;
  push_notifications_enabled: boolean;
};

const runId = `part18i-${randomUUID()}`;
const userMovieIds: string[] = [];
const movieIds: number[] = [];
const subscriptionEndpoints: string[] = [];
const notificationIds: string[] = [];

let admin: SupabaseClient;
let userA: QaUser;
let userB: QaUser;
let originalA: Preferences;
let originalB: Preferences;

async function authenticate(kind: "A" | "B"): Promise<QaUser> {
  const client = createClient(
    value("NEXT_PUBLIC_SUPABASE_URL")!,
    value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: value(`E2E_USER_${kind}_EMAIL`)!,
    password: value(`E2E_USER_${kind}_PASSWORD`)!,
  });
  expect(error).toBeNull();
  expect(data.user).not.toBeNull();
  return { client, userId: data.user!.id };
}

async function preferences(user: QaUser) {
  const result = await user.client
    .from("user_preferences")
    .select("schedule_reminders_enabled, reminder_offset_minutes, push_notifications_enabled")
    .eq("user_id", user.userId)
    .single();
  expect(result.error).toBeNull();
  return result.data as Preferences;
}

async function setPreferences(
  user: QaUser,
  next: Partial<Preferences>,
) {
  const result = await user.client
    .from("user_preferences")
    .update(next)
    .eq("user_id", user.userId);
  expect(result.error).toBeNull();
}

async function createScheduledFixture(
  user: QaUser,
  suffix: string,
  options: { timezone?: string; minutesFromNow?: number } = {},
) {
  const tmdbId = 1_500_000_000 + Math.floor(Math.random() * 500_000_000);
  const title = `Part 18I ${suffix} ${runId}`;
  const movie = await admin
    .from("movies")
    .insert({
      tmdb_id: tmdbId,
      title,
      genres: [],
      main_cast: [],
      production_countries: [],
    })
    .select("id")
    .single();
  expect(movie.error).toBeNull();
  movieIds.push(movie.data!.id);

  const userMovieId = randomUUID();
  const scheduledFor = new Date(
    Date.now() + (options.minutesFromNow ?? 30) * 60_000,
  ).toISOString();
  const relationship = await admin.from("user_movies").insert({
    id: userMovieId,
    user_id: user.userId,
    movie_id: movie.data!.id,
    status: "scheduled",
    scheduled_for: scheduledFor,
    schedule_timezone: options.timezone ?? "UTC",
  });
  expect(relationship.error).toBeNull();
  userMovieIds.push(userMovieId);
  return { userMovieId, title, scheduledFor };
}

async function readJob(userMovieId: string) {
  const result = await admin
    .from("scheduled_notification_jobs")
    .select("*")
    .eq("id", userMovieId)
    .single();
  expect(result.error).toBeNull();
  return result.data!;
}

async function claim(batchSize = 1) {
  const result = await admin.rpc("watchflow_claim_scheduled_reminders", {
    p_batch_size: batchSize,
    p_lease_seconds: 30,
  });
  expect(result.error).toBeNull();
  return result.data ?? [];
}

async function finalize(
  row: Record<string, unknown>,
  outcome: string,
  statusCode: number | null,
) {
  const result = await admin.rpc("watchflow_finalize_scheduled_reminder", {
    p_job_id: row.job_id,
    p_lease_token: row.lease_token,
    p_results: [{ deliveryId: row.delivery_id, outcome, statusCode }],
  });
  expect(result.error).toBeNull();
  return result.data;
}

async function saveFakeSubscription(user: QaUser, suffix: string) {
  const endpoint = `https://push.example.test/${runId}/${suffix}`;
  const result = await user.client.rpc("watchflow_save_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: "A".repeat(64),
    p_auth_key: "B".repeat(24),
    p_expiration_time: null,
    p_user_agent: "Part 18I guarded acceptance",
  });
  expect(result.error).toBeNull();
  subscriptionEndpoints.push(endpoint);
  return endpoint;
}

async function makeRetryDue(jobId: string) {
  const deliveries = await admin
    .from("scheduled_notification_deliveries")
    .update({ available_at: new Date(Date.now() - 1_000).toISOString() })
    .eq("job_id", jobId)
    .eq("state", "retry");
  expect(deliveries.error).toBeNull();
  const job = await admin
    .from("scheduled_notification_jobs")
    .update({ available_at: new Date(Date.now() - 1_000).toISOString() })
    .eq("id", jobId)
    .eq("state", "retry");
  expect(job.error).toBeNull();
}

integrationDescribe.sequential("Part 18I guarded database acceptance", () => {
  beforeAll(async () => {
    admin = createClient(
      value("NEXT_PUBLIC_SUPABASE_URL")!,
      value("SUPABASE_SECRET_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    [userA, userB] = await Promise.all([authenticate("A"), authenticate("B")]);
    expect(userA.userId).not.toBe(userB.userId);
    [originalA, originalB] = await Promise.all([
      preferences(userA),
      preferences(userB),
    ]);

    const unexpectedDue = await admin
      .from("scheduled_notification_jobs")
      .select("id")
      .in("state", ["pending", "retry", "processing"])
      .lte("reminder_at", new Date().toISOString())
      .lte("available_at", new Date().toISOString());
    expect(unexpectedDue.error).toBeNull();
    expect(
      unexpectedDue.data,
      "Acceptance refuses to claim pre-existing due reminder jobs.",
    ).toEqual([]);
  });

  afterAll(async () => {
    if (notificationIds.length > 0) {
      await admin.from("notifications").delete().in("id", notificationIds);
    }
    if (subscriptionEndpoints.length > 0) {
      await admin
        .from("push_subscriptions")
        .delete()
        .in("endpoint", subscriptionEndpoints)
        .in("user_id", [userA.userId, userB.userId]);
    }
    if (userMovieIds.length > 0) {
      await admin
        .from("user_movies")
        .delete()
        .in("id", userMovieIds)
        .in("user_id", [userA.userId, userB.userId]);
    }
    if (movieIds.length > 0) {
      await admin.from("movies").delete().in("id", movieIds);
    }
    await Promise.all([
      setPreferences(userA, originalA),
      setPreferences(userB, originalB),
    ]);
    await Promise.allSettled([
      userA.client.auth.signOut(),
      userB.client.auth.signOut(),
    ]);
  });

  it("creates an exact owner job with timezone-correct reminder arithmetic and RLS", async () => {
    await setPreferences(userA, {
      schedule_reminders_enabled: true,
      reminder_offset_minutes: 60,
      push_notifications_enabled: false,
    });
    const fixture = await createScheduledFixture(userA, "timezone", {
      timezone: "Asia/Karachi",
    });
    const job = await readJob(fixture.userMovieId);
    expect(job.user_id).toBe(userA.userId);
    expect(job.schedule_timezone).toBe("Asia/Karachi");
    expect(job.reminder_offset_minutes).toBe(60);
    expect(new Date(job.scheduled_for).getTime() - new Date(job.reminder_at).getTime())
      .toBe(60 * 60_000);

    const own = await userA.client
      .from("scheduled_notification_jobs")
      .select("id")
      .eq("id", fixture.userMovieId);
    expect(own).toMatchObject({ data: [{ id: fixture.userMovieId }], error: null });
    const crossOwner = await userB.client
      .from("scheduled_notification_jobs")
      .select("id")
      .eq("id", fixture.userMovieId);
    expect(crossOwner).toMatchObject({ data: [], error: null });

    const retireFixture = await admin
      .from("user_movies")
      .update({
        status: "want_to_watch",
        scheduled_for: null,
        schedule_timezone: null,
      })
      .eq("id", fixture.userMovieId)
      .eq("user_id", userA.userId);
    expect(retireFixture.error).toBeNull();
  });

  it("creates one deterministic durable notification and repeated claims stay idempotent", async () => {
    const fixture = await createScheduledFixture(userA, "idempotent");
    const before = await readJob(fixture.userMovieId);
    expect(await claim()).toEqual([]);
    const afterFirst = await admin
      .from("notifications")
      .select("id, user_id, action_path, metadata")
      .eq("id", before.notification_id);
    expect(afterFirst.error).toBeNull();
    expect(afterFirst.data).toHaveLength(1);
    expect(afterFirst.data![0]).toMatchObject({
      id: before.notification_id,
      user_id: userA.userId,
      action_path: "/schedule",
    });
    expect(afterFirst.data![0].metadata).toMatchObject({
      category: "schedule_reminders",
      movie_title: fixture.title,
      schedule_timezone: "UTC",
    });
    notificationIds.push(before.notification_id);
    expect(await claim()).toEqual([]);
    const duplicateCheck = await admin
      .from("notifications")
      .select("id")
      .eq("id", before.notification_id);
    expect(duplicateCheck.data).toHaveLength(1);
  });

  it("skips disabled, rescheduled, exited, and deleted schedules safely", async () => {
    await setPreferences(userB, {
      schedule_reminders_enabled: false,
      reminder_offset_minutes: 60,
      push_notifications_enabled: false,
    });
    const disabled = await createScheduledFixture(userB, "disabled");
    expect(await readJob(disabled.userMovieId)).toMatchObject({
      state: "skipped",
      result_code: "reminders_disabled",
    });

    const retireDisabled = await admin
      .from("user_movies")
      .update({
        status: "want_to_watch",
        scheduled_for: null,
        schedule_timezone: null,
      })
      .eq("id", disabled.userMovieId)
      .eq("user_id", userB.userId);
    expect(retireDisabled.error).toBeNull();

    await setPreferences(userB, { schedule_reminders_enabled: true });
    const rescheduled = await createScheduledFixture(userB, "rescheduled");
    const originalJob = await readJob(rescheduled.userMovieId);
    const nextInstant = new Date(Date.now() + 45 * 60_000).toISOString();
    const update = await admin
      .from("user_movies")
      .update({ scheduled_for: nextInstant, schedule_timezone: "America/New_York" })
      .eq("id", rescheduled.userMovieId)
      .eq("user_id", userB.userId);
    expect(update.error).toBeNull();
    const nextJob = await readJob(rescheduled.userMovieId);
    expect(nextJob.schedule_key).not.toBe(originalJob.schedule_key);
    expect(nextJob.notification_id).not.toBe(originalJob.notification_id);
    expect(nextJob.schedule_timezone).toBe("America/New_York");

    const exited = await admin
      .from("user_movies")
      .update({
        status: "want_to_watch",
        scheduled_for: null,
        schedule_timezone: null,
      })
      .eq("id", rescheduled.userMovieId)
      .eq("user_id", userB.userId);
    expect(exited.error).toBeNull();
    expect(await readJob(rescheduled.userMovieId)).toMatchObject({
      state: "skipped",
      result_code: "schedule_changed",
    });

    const deleted = await createScheduledFixture(userB, "deleted");
    const deletion = await admin
      .from("user_movies")
      .delete()
      .eq("id", deleted.userMovieId)
      .eq("user_id", userB.userId);
    expect(deletion.error).toBeNull();
    const deletedJob = await admin
      .from("scheduled_notification_jobs")
      .select("id")
      .eq("id", deleted.userMovieId);
    expect(deletedJob).toMatchObject({ data: [], error: null });
  });

  it("enforces leases, retries transient failures, and cleans a 410 subscription", async () => {
    await setPreferences(userA, {
      schedule_reminders_enabled: true,
      reminder_offset_minutes: 60,
      push_notifications_enabled: true,
    });
    await saveFakeSubscription(userA, "retry");
    const retryFixture = await createScheduledFixture(userA, "retry");
    const retryJob = await readJob(retryFixture.userMovieId);
    notificationIds.push(retryJob.notification_id);
    const firstClaim = await claim();
    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0].job_id).toBe(retryFixture.userMovieId);
    expect(await claim()).toEqual([]);
    expect(await finalize(firstClaim[0], "retryable_failure", 503)).toBe("retry");
    await makeRetryDue(retryFixture.userMovieId);
    const secondClaim = await claim();
    expect(secondClaim).toHaveLength(1);
    expect(secondClaim[0].delivery_id).toBe(firstClaim[0].delivery_id);
    expect(await finalize(secondClaim[0], "delivered", null)).toBe("delivered");
    const delivered = await readJob(retryFixture.userMovieId);
    expect(delivered).toMatchObject({ state: "delivered", attempts: 2 });

    const invalidEndpoint = await saveFakeSubscription(userA, "invalid");
    const invalidFixture = await createScheduledFixture(userA, "invalid");
    const invalidJob = await readJob(invalidFixture.userMovieId);
    notificationIds.push(invalidJob.notification_id);
    const invalidClaims = await claim();
    const invalidClaim = invalidClaims.find(
      (row: Record<string, unknown>) => row.endpoint === invalidEndpoint,
    );
    expect(invalidClaim).toBeTruthy();
    await finalize(invalidClaim!, "permanent_failure", 410);
    const removed = await admin
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", invalidEndpoint);
    expect(removed).toMatchObject({ data: [], error: null });
  });

  it("recovers expired leases without duplicate delivery and enforces attempt limits", async () => {
    const leaseFixture = await createScheduledFixture(userA, "lease");
    const leaseJob = await readJob(leaseFixture.userMovieId);
    notificationIds.push(leaseJob.notification_id);
    const leased = await claim();
    expect(leased).toHaveLength(1);
    const expiredAt = new Date(Date.now() - 1_000).toISOString();
    await admin
      .from("scheduled_notification_deliveries")
      .update({ lease_expires_at: expiredAt })
      .eq("job_id", leaseFixture.userMovieId);
    await admin
      .from("scheduled_notification_jobs")
      .update({ lease_expires_at: expiredAt })
      .eq("id", leaseFixture.userMovieId);
    expect(await claim()).toEqual([]);
    expect(await readJob(leaseFixture.userMovieId)).toMatchObject({
      state: "failed",
      result_code: "delivery_attempts_exhausted",
    });

    const limitFixture = await createScheduledFixture(userA, "attempt-limit");
    const limitJob = await readJob(limitFixture.userMovieId);
    notificationIds.push(limitJob.notification_id);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const rows = await claim();
      expect(rows).toHaveLength(1);
      const state = await finalize(rows[0], "retryable_failure", 503);
      if (attempt < 3) {
        expect(state).toBe("retry");
        await makeRetryDue(limitFixture.userMovieId);
      } else {
        expect(state).toBe("failed");
      }
    }
    const terminal = await readJob(limitFixture.userMovieId);
    expect(terminal).toMatchObject({ state: "failed", attempts: 3 });
    const delivery = await admin
      .from("scheduled_notification_deliveries")
      .select("attempts, state")
      .eq("job_id", limitFixture.userMovieId)
      .single();
    expect(delivery).toMatchObject({ data: { attempts: 3, state: "failed" }, error: null });
  });
});
