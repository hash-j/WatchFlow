import { runInNewContext } from "node:vm";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures/qa";
import { clickAndWaitForMutation } from "./helpers/assertions";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import {
  authenticatedQaGuard,
  developmentTargetGuard,
  getQaCredentials,
} from "./helpers/environment";
import {
  addControlledMovie,
  removeControlledMovie,
  type ControlledMovie,
} from "./helpers/movies";

const runId = `part18h-browser-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const categoryLabels = [
  "Watching and watched status updates",
  "Watch Next additions",
  "Custom list additions",
  "CSV import completions",
] as const;
const categoryColumns = [
  "notification_movie_status_enabled",
  "notification_watch_next_enabled",
  "notification_custom_lists_enabled",
  "notification_imports_enabled",
] as const;
const movieCandidates = [
  "Inception",
  "Arrival",
  "Interstellar",
  "The Matrix",
  "Moon",
  "Coherence",
  "Primer",
  "Gattaca",
  "Contact",
  "Ex Machina",
  "The Prestige",
  "Memento",
];

type CategoryPreferences = Record<(typeof categoryColumns)[number], boolean>;

let admin: SupabaseClient | null = null;
let userAClient: SupabaseClient | null = null;
let userBClient: SupabaseClient | null = null;
let userAId = "";
let userBId = "";
let originalPreferences: CategoryPreferences | null = null;

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required guarded QA variable is missing: ${name}`);
  return value;
}

async function authenticatedClient(kind: "A" | "B") {
  const client = createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword(
    getQaCredentials(kind),
  );
  if (error || !data.user) {
    throw new Error(`QA User ${kind} could not authenticate for Part 18H acceptance.`);
  }
  return { client, userId: data.user.id };
}

async function setCategoryToggles(page: Page, checked: boolean) {
  for (const label of categoryLabels) {
    const checkbox = page.getByRole("checkbox", { name: label });
    if (checked) await checkbox.check();
    else await checkbox.uncheck();
  }
  await clickAndWaitForMutation(
    page,
    page.getByRole("button", { name: "Save notification preferences" }),
    { success: "Notification preferences saved." },
  );
}

async function openControlledMovie(page: Page, movie: ControlledMovie) {
  await page.goto(`/library?q=${encodeURIComponent(movie.title)}`);
  const item = page.locator(`article[data-tmdb-id="${movie.tmdbId}"]`);
  await expect(item).toBeVisible();
  await item.getByRole("link").first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: movie.title, exact: true }),
  ).toBeVisible();
}

async function saveMovieStatus(
  page: Page,
  status: "want_to_watch" | "watch_next",
) {
  await page.getByLabel("Status", { exact: true }).selectOption(status);
  await clickAndWaitForMutation(
    page,
    page.getByRole("button", { name: "Save changes" }),
    { success: "Movie details saved." },
  );
}

async function removeRunNotifications() {
  if (!admin || !userAId || !userBId) return;
  const rows = await admin
    .from("notifications")
    .select("id")
    .in("user_id", [userAId, userBId])
    .eq("metadata->>qa_run_id", runId);
  if (rows.error) throw new Error("Part 18H notification cleanup inspection failed.");
  const ids = (rows.data ?? []).map(({ id }) => id);
  if (ids.length === 0) return;
  const cleanup = await admin
    .from("notifications")
    .delete()
    .in("user_id", [userAId, userBId])
    .in("id", ids);
  if (cleanup.error) throw new Error("Part 18H notification cleanup failed.");
}

test.describe("Part 18H guarded notification-center acceptance", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!authenticatedQaGuard.enabled, authenticatedQaGuard.reason);

  test.beforeAll(async () => {
    if (!developmentTargetGuard.enabled || !authenticatedQaGuard.enabled) return;
    admin = createClient(
      requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
      requiredEnvironment("SUPABASE_SECRET_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const [userA, userB] = await Promise.all([
      authenticatedClient("A"),
      authenticatedClient("B"),
    ]);
    userAClient = userA.client;
    userBClient = userB.client;
    userAId = userA.userId;
    userBId = userB.userId;

    const preferences = await userBClient
      .from("user_preferences")
      .select(categoryColumns.join(","))
      .eq("user_id", userBId)
      .single();
    if (preferences.error || !preferences.data) {
      throw new Error("QA User B notification preferences could not be captured.");
    }
    originalPreferences = preferences.data as unknown as CategoryPreferences;
    await removeRunNotifications();
  });

  test.afterAll(async () => {
    await removeRunNotifications();
    if (userBClient && originalPreferences) {
      const restore = await userBClient
        .from("user_preferences")
        .update(originalPreferences)
        .eq("user_id", userBId);
      if (restore.error) throw new Error("QA User B preferences could not be restored.");
    }
    await Promise.all([userAClient?.auth.signOut(), userBClient?.auth.signOut()]);
  });

  test("notification route exposes its loading boundary and empty state", async ({
    qaUserBPage,
    qaUserBAudit,
  }) => {
    await qaUserBPage.goto("/dashboard");
    let delayed = false;
    await qaUserBPage.route("**/notifications?*", async (route) => {
      const request = route.request();
      if (!delayed && request.headers().rsc === "1") {
        delayed = true;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      await route.continue();
    });

    const navigation = qaUserBPage
      .getByRole("link", { name: "Notifications", exact: true })
      .first()
      .click();
    await expect(
      qaUserBPage.getByRole("status", { name: "Loading notifications" }),
    ).toBeVisible({ timeout: 5_000 });
    await navigation;
    await expect(
      qaUserBPage.getByRole("heading", { name: "No notifications yet" }),
    ).toBeVisible();
    expect(delayed).toBe(true);
    expectNoUnexpectedBrowserFailures(qaUserBAudit, {
      allowedCategories: ["aborted"],
    });
  });

  test("category controls render, persist, suppress, and resume Watch Next notifications", async ({
    qaUserAPage,
    qaUserBPage,
    qaUserAAudit,
    qaUserBAudit,
  }) => {
    test.setTimeout(300_000);
    let movie: ControlledMovie | null = null;
    let userMovieId = "";
    const notificationIds: string[] = [];

    try {
      for (const query of movieCandidates) {
        const candidate = await addControlledMovie(qaUserBPage, query);
        if (candidate.addedByTest) {
          movie = candidate;
          break;
        }
      }
      expect(
        movie,
        "At least one controlled Part 18H movie must be isolated from QA User B's existing library.",
      ).not.toBeNull();
      if (!admin || !movie) throw new Error("Guarded Part 18H fixture setup is unavailable.");

      const sharedMovie = await admin
        .from("movies")
        .select("id")
        .eq("tmdb_id", movie.tmdbId)
        .single();
      expect(sharedMovie.error).toBeNull();
      const ownedMovie = await admin
        .from("user_movies")
        .select("id")
        .eq("user_id", userBId)
        .eq("movie_id", sharedMovie.data!.id)
        .single();
      expect(ownedMovie.error).toBeNull();
      userMovieId = ownedMovie.data!.id;

      await openControlledMovie(qaUserBPage, movie);
      await saveMovieStatus(qaUserBPage, "want_to_watch");
      await qaUserBPage.goto("/settings/notifications");
      for (const label of categoryLabels) {
        await expect(qaUserBPage.getByRole("checkbox", { name: label })).toBeVisible();
      }
      await setCategoryToggles(qaUserBPage, false);
      await qaUserBPage.reload();
      for (const label of categoryLabels) {
        await expect(qaUserBPage.getByRole("checkbox", { name: label })).not.toBeChecked();
      }

      await openControlledMovie(qaUserBPage, movie);
      await saveMovieStatus(qaUserBPage, "watch_next");
      const suppressed = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", userBId)
        .eq("metadata->>user_movie_id", userMovieId);
      expect(suppressed.error).toBeNull();
      expect(suppressed.data).toEqual([]);

      await openControlledMovie(qaUserBPage, movie);
      await saveMovieStatus(qaUserBPage, "want_to_watch");
      await qaUserBPage.goto("/settings/notifications");
      await setCategoryToggles(qaUserBPage, true);
      await qaUserBPage.reload();
      for (const label of categoryLabels) {
        await expect(qaUserBPage.getByRole("checkbox", { name: label })).toBeChecked();
      }

      await openControlledMovie(qaUserBPage, movie);
      await saveMovieStatus(qaUserBPage, "watch_next");
      const resumed = await admin
        .from("notifications")
        .select("id, metadata")
        .eq("user_id", userBId)
        .eq("metadata->>user_movie_id", userMovieId);
      expect(resumed.error).toBeNull();
      expect(resumed.data).toHaveLength(1);
      notificationIds.push(resumed.data![0].id);

      await openControlledMovie(qaUserBPage, movie);
      await saveMovieStatus(qaUserBPage, "watch_next");
      const afterDuplicateAttempt = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", userBId)
        .eq("metadata->>user_movie_id", userMovieId);
      expect(afterDuplicateAttempt.error).toBeNull();
      expect(afterDuplicateAttempt.data?.map(({ id }) => id)).toEqual(notificationIds);

      await qaUserBPage.goto("/notifications");
      const article = qaUserBPage.locator("article").filter({
        has: qaUserBPage.getByRole("heading", { name: "Added to Watch Next" }),
      });
      await expect(article.getByText("Watch Next", { exact: true })).toBeVisible();
      await expect(article.getByRole("img", { name: `${movie.title} poster` })).toBeVisible();
      const contextLink = article.getByRole("link", { name: "View details" });
      const href = await contextLink.getAttribute("href");
      expect(href).toContain(`/watch-next?notification=${notificationIds[0]}`);
      expect(href).toContain("notificationSource=center");
      await contextLink.click();
      const destination = new URL(qaUserBPage.url());
      expect(destination.origin).toBe(new URL(requiredEnvironment("E2E_BASE_URL")).origin);
      expect(destination.pathname).toBe("/watch-next");
      expect(destination.searchParams.get("notification")).toBe(notificationIds[0]);

      await qaUserBPage.goto("/notifications");
      await expect(qaUserBPage.getByText("1 unread", { exact: true })).toBeVisible();
      await qaUserBPage.reload();
      await expect(qaUserBPage.getByText("1 unread", { exact: true })).toBeVisible();
      await clickAndWaitForMutation(
        qaUserBPage,
        qaUserBPage.getByRole("button", {
          name: "Mark Added to Watch Next as read",
        }),
        {
          visible: qaUserBPage.getByText("0 unread", { exact: true }),
        },
      );

      await qaUserAPage.goto("/notifications");
      await expect(qaUserAPage.getByText(movie.title)).toHaveCount(0);
      expectNoUnexpectedBrowserFailures(qaUserAAudit);
      expectNoUnexpectedBrowserFailures(qaUserBAudit, {
        allowedCategories: ["aborted", "next-image-lcp-advice"],
      });
    } finally {
      if (movie) await removeControlledMovie(qaUserBPage, movie);
      if (admin && notificationIds.length > 0) {
        const cleanup = await admin
          .from("notifications")
          .delete()
          .eq("user_id", userBId)
          .in("id", notificationIds);
        if (cleanup.error) throw new Error("Part 18H producer fixture cleanup failed.");
      }
    }
  });

  test("the shipped push-click navigation contract stays same-origin", async ({
    qaUserBPage,
    qaUserBAudit,
  }) => {
    await qaUserBPage.goto("/dashboard");
    await expect.poll(
      () => qaUserBPage.evaluate(async () => Boolean(await navigator.serviceWorker.ready)),
      { timeout: 15_000 },
    ).toBe(true);

    const applicationOrigin = new URL(qaUserBPage.url()).origin;
    const workerResponse = await qaUserBPage.context().request.get(
      new URL("/sw.js", applicationOrigin).href,
      { headers: { "cache-control": "no-store" } },
    );
    expect(workerResponse.ok()).toBe(true);
    const source = await workerResponse.text();
    const start = source.indexOf("function internalNotificationUrl");
    const end = source.indexOf('self.addEventListener("push"', start);
    if (start < 0 || end < 0) throw new Error("Push URL guard is missing.");
    const implementation = source.slice(start, end);
    const normalize = runInNewContext(
      `${implementation}; internalNotificationUrl`,
      {
        self: { location: { origin: applicationOrigin } },
        URL,
      },
      { timeout: 1_000 },
    ) as (value: unknown) => string;
    const result = {
      internal: normalize("/watch-next?notification=qa#context"),
      external: normalize("https://example.com/escape"),
      protocolRelative: normalize("//example.com/escape"),
      clickUsesGuard:
        source.includes('self.addEventListener("notificationclick"') &&
        source.includes("const actionUrl = internalNotificationUrl(candidateUrl)") &&
        source.includes("new URL(actionUrl, self.location.origin).href"),
    };

    expect(result).toEqual({
      internal: "/watch-next?notification=qa#context",
      external: "/notifications",
      protocolRelative: "/notifications",
      clickUsesGuard: true,
    });
    expectNoUnexpectedBrowserFailures(qaUserBAudit);
  });
});
