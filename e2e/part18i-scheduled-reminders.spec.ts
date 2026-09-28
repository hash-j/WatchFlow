import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { test, expect } from "./fixtures/qa";
import { clickAndWaitForMutation } from "./helpers/assertions";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import {
  authenticatedQaGuard,
  developmentTargetGuard,
  getQaCredentials,
} from "./helpers/environment";

const schedulerSecret = process.env.WATCHFLOW_SCHEDULER_SECRET?.trim() ?? "";
const schedulerGuard =
  authenticatedQaGuard.enabled && schedulerSecret.length >= 32;
const runId = `part18i-browser-${randomUUID()}`;

let admin: SupabaseClient | null = null;
let userAClient: SupabaseClient | null = null;
let userBClient: SupabaseClient | null = null;
let userBId = "";
let originalPreferences: Record<string, unknown> | null = null;
let userMovieId = "";
let movieId: number | null = null;
let notificationId = "";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required guarded QA variable is missing: ${name}`);
  return value;
}

async function authenticate(kind: "A" | "B") {
  const client = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword(
    getQaCredentials(kind),
  );
  if (error || !data.user) {
    throw new Error(`QA User ${kind} could not authenticate for Part 18I acceptance.`);
  }
  return { client, userId: data.user.id };
}

test.describe("Part 18I guarded scheduled reminder acceptance", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!schedulerGuard, schedulerSecret.length < 32
    ? "WATCHFLOW_SCHEDULER_SECRET must contain at least 32 characters"
    : authenticatedQaGuard.reason);

  test.beforeAll(async () => {
    if (!developmentTargetGuard.enabled || !schedulerGuard) return;
    admin = createClient(
      required("NEXT_PUBLIC_SUPABASE_URL"),
      required("SUPABASE_SECRET_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const [userA, userB] = await Promise.all([
      authenticate("A"),
      authenticate("B"),
    ]);
    userAClient = userA.client;
    userBClient = userB.client;
    userBId = userB.userId;

    const preferences = await userBClient
      .from("user_preferences")
      .select("schedule_reminders_enabled, reminder_offset_minutes, push_notifications_enabled")
      .eq("user_id", userBId)
      .single();
    if (preferences.error || !preferences.data) {
      throw new Error("QA User B reminder preferences could not be captured.");
    }
    originalPreferences = preferences.data;

    const unexpectedDue = await admin
      .from("scheduled_notification_jobs")
      .select("id")
      .in("state", ["pending", "retry", "processing"])
      .lte("reminder_at", new Date().toISOString())
      .lte("available_at", new Date().toISOString());
    if (unexpectedDue.error || (unexpectedDue.data?.length ?? 0) > 0) {
      throw new Error("Part 18I browser acceptance refuses to claim pre-existing due jobs.");
    }
  });

  test.afterAll(async () => {
    if (admin && notificationId) {
      const cleanup = await admin
        .from("notifications")
        .delete()
        .eq("id", notificationId)
        .eq("user_id", userBId);
      expect(cleanup.error).toBeNull();
    }
    if (admin && userMovieId) {
      const cleanup = await admin
        .from("user_movies")
        .delete()
        .eq("id", userMovieId)
        .eq("user_id", userBId);
      expect(cleanup.error).toBeNull();
    }
    if (admin && movieId !== null) {
      const cleanup = await admin.from("movies").delete().eq("id", movieId);
      expect(cleanup.error).toBeNull();
    }
    if (userBClient && originalPreferences) {
      const restore = await userBClient
        .from("user_preferences")
        .update(originalPreferences)
        .eq("user_id", userBId);
      expect(restore.error).toBeNull();
    }
    if (admin && notificationId) {
      const remaining = await admin
        .from("notifications")
        .select("id")
        .eq("id", notificationId)
        .eq("user_id", userBId);
      expect(remaining).toMatchObject({ data: [], error: null });
    }
    if (admin && userMovieId) {
      const remaining = await admin
        .from("user_movies")
        .select("id")
        .eq("id", userMovieId)
        .eq("user_id", userBId);
      expect(remaining).toMatchObject({ data: [], error: null });
    }
    await Promise.allSettled([
      userAClient?.auth.signOut(),
      userBClient?.auth.signOut(),
    ]);
  });

  test("scheduler endpoint fails closed for missing, malformed, and wrong credentials", async ({
    request,
  }) => {
    const path = "/api/internal/notifications/scheduled-reminders";
    const missing = await request.post(path);
    expect(missing.status()).toBe(401);
    const malformed = await request.post(path, {
      headers: { authorization: "Basic malformed" },
    });
    expect(malformed.status()).toBe(401);
    const wrong = await request.post(path, {
      headers: { authorization: `Bearer ${"x".repeat(32)}` },
    });
    expect(wrong.status()).toBe(401);
  });

  test("creates, renders, navigates, persists, and cleans one owner reminder", async ({
    qaUserAPage,
    qaUserBPage,
    qaUserAAudit,
    qaUserBAudit,
  }) => {
    if (!admin || !userAClient || !userBClient) {
      throw new Error("Part 18I guarded browser setup is unavailable.");
    }
    const title = `Part 18I browser movie ${runId}`;
    const tmdbId = 1_500_000_000 + Math.floor(Math.random() * 500_000_000);
    const unreadBefore = await userBClient
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userBId)
      .is("read_at", null);
    expect(unreadBefore.error).toBeNull();
    const baselineUnread = unreadBefore.count ?? 0;

    const preferenceUpdate = await userBClient
      .from("user_preferences")
      .update({
        schedule_reminders_enabled: true,
        reminder_offset_minutes: 60,
        push_notifications_enabled: false,
      })
      .eq("user_id", userBId);
    expect(preferenceUpdate.error).toBeNull();

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
    movieId = movie.data!.id;
    userMovieId = randomUUID();
    const scheduledFor = new Date(Date.now() + 30 * 60_000).toISOString();
    const relationship = await admin.from("user_movies").insert({
      id: userMovieId,
      user_id: userBId,
      movie_id: movieId,
      status: "scheduled",
      scheduled_for: scheduledFor,
      schedule_timezone: "Asia/Karachi",
    });
    expect(relationship.error).toBeNull();

    const jobBefore = await admin
      .from("scheduled_notification_jobs")
      .select("notification_id, state, schedule_timezone")
      .eq("id", userMovieId)
      .eq("user_id", userBId)
      .single();
    expect(jobBefore.error).toBeNull();
    expect(jobBefore.data).toMatchObject({
      state: "pending",
      schedule_timezone: "Asia/Karachi",
    });
    notificationId = jobBefore.data!.notification_id;

    const correct = await qaUserBPage.context().request.post(
      "/api/internal/notifications/scheduled-reminders",
      { headers: { authorization: `Bearer ${schedulerSecret}` } },
    );
    expect(correct.status()).toBe(200);
    const repeated = await qaUserBPage.context().request.post(
      "/api/internal/notifications/scheduled-reminders",
      { headers: { authorization: `Bearer ${schedulerSecret}` } },
    );
    expect(repeated.status()).toBe(200);

    const durable = await admin
      .from("notifications")
      .select("id, user_id, read_at, action_path, metadata")
      .eq("id", notificationId)
      .eq("user_id", userBId);
    expect(durable.error).toBeNull();
    expect(durable.data).toHaveLength(1);
    expect(durable.data![0]).toMatchObject({
      id: notificationId,
      user_id: userBId,
      read_at: null,
      action_path: "/schedule",
    });
    expect(durable.data![0].metadata).toMatchObject({
      category: "schedule_reminders",
      movie_title: title,
      schedule_timezone: "Asia/Karachi",
    });
    const jobAfter = await admin
      .from("scheduled_notification_jobs")
      .select("state, result_code")
      .eq("id", userMovieId)
      .single();
    expect(jobAfter).toMatchObject({
      data: {
        state: "delivered",
        result_code: "in_app_only_push_disabled",
      },
      error: null,
    });

    await qaUserBPage.goto("/notifications");
    const expectedBody = `${title} is coming up on your schedule.`;
    const article = qaUserBPage.locator("article").filter({
      has: qaUserBPage.getByText(expectedBody, { exact: true }),
    });
    await expect(article).toBeVisible();
    await expect(
      article.getByRole("heading", {
        name: "Scheduled movie reminder",
        exact: true,
      }),
    ).toBeVisible();
    await expect(article.getByText("Schedule reminders", { exact: true })).toBeVisible();
    await expect(article.getByText(expectedBody, { exact: true })).toBeVisible();
    await expect(qaUserBPage.getByText(`${baselineUnread + 1} unread`, { exact: true })).toBeVisible();
    const link = article.getByRole("link", { name: "View details" });
    await link.click();
    await expect(qaUserBPage).toHaveURL(new RegExp(
      `/schedule\\?notification=${notificationId}&notificationSource=center$`,
    ));

    await qaUserBPage.goto("/notifications");
    await clickAndWaitForMutation(
      qaUserBPage,
      article.getByRole("button", { name: "Mark Scheduled movie reminder as read" }),
      { visible: qaUserBPage.getByText(`${baselineUnread} unread`, { exact: true }) },
    );
    await qaUserBPage.reload();
    await expect(qaUserBPage.getByText(`${baselineUnread} unread`, { exact: true })).toBeVisible();
    const persisted = await admin
      .from("notifications")
      .select("read_at")
      .eq("id", notificationId)
      .single();
    expect(persisted.error).toBeNull();
    expect(persisted.data?.read_at).toEqual(expect.any(String));

    await qaUserAPage.goto("/notifications");
    await expect(qaUserAPage.getByText(title)).toHaveCount(0);
    const crossOwner = await userAClient
      .from("scheduled_notification_jobs")
      .select("id")
      .eq("id", userMovieId);
    expect(crossOwner).toMatchObject({ data: [], error: null });
    expectNoUnexpectedBrowserFailures(qaUserAAudit);
    expectNoUnexpectedBrowserFailures(qaUserBAudit, {
      allowedCategories: ["next-image-lcp-advice"],
    });
  });
});
