import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures/qa";
import {
  authenticatedQaGuard,
  developmentTargetGuard,
  getQaCredentials,
} from "./helpers/environment";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import { uploadCsvFixture } from "./helpers/csv";
import { clickAndWaitForMutation } from "./helpers/assertions";
import { createQaList, deleteQaList } from "./helpers/lists";
import {
  addControlledMovie,
  removeControlledMovie,
  type ControlledMovie,
} from "./helpers/movies";

type SeededNotification = {
  id: string;
  user_id: string;
};

const runId = `part18c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const userATitle = `Part 18C QA User A ${runId}`;
const userBFirstTitle = `Part 18C QA User B first ${runId}`;
const userBSecondTitle = `Part 18C QA User B second ${runId}`;

let admin: SupabaseClient | null = null;
let userAClient: SupabaseClient | null = null;
let userBClient: SupabaseClient | null = null;
let userAId = "";
let userBId = "";
let seeded: SeededNotification[] = [];
let originalCategoryPreferences: Record<string, boolean> | null = null;

const categoryPreferenceColumns = [
  "notification_movie_status_enabled",
  "notification_watch_next_enabled",
  "notification_custom_lists_enabled",
  "notification_imports_enabled",
] as const;

const importCandidates = [
  { title: "Inception", tmdbId: 27205, year: 2010 },
  { title: "Arrival", tmdbId: 329865, year: 2016 },
  { title: "Interstellar", tmdbId: 157336, year: 2014 },
  { title: "The Matrix", tmdbId: 603, year: 1999 },
] as const;

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
    throw new Error(`QA User ${kind} could not authenticate for notification RLS verification.`);
  }
  return { client, userId: data.user.id };
}

async function seedNotifications() {
  if (!admin || !userAId || !userBId) throw new Error("Guarded notification fixture setup is unavailable.");

  const { data, error } = await admin
    .from("notifications")
    .insert([
      {
        user_id: userAId,
        type: "system",
        title: userATitle,
        body: "Isolated system notification for QA User A.",
        action_path: "/notifications",
        metadata: { qa_run_id: runId },
      },
      {
        user_id: userBId,
        type: "system",
        title: userBFirstTitle,
        body: "First isolated system notification for QA User B.",
        action_path: "/settings/notifications",
        metadata: { qa_run_id: runId },
      },
      {
        user_id: userBId,
        type: "system",
        title: userBSecondTitle,
        body: "Second isolated system notification for QA User B.",
        metadata: { qa_run_id: runId },
      },
    ])
    .select("id, user_id");

  if (error || !data || data.length !== 3) {
    throw new Error("Guarded notification fixtures could not be created.");
  }

  seeded = data;
}

async function cleanupNotifications() {
  if (!admin || seeded.length === 0) return;
  const ids = seeded.map(({ id }) => id);
  const { error } = await admin
    .from("notifications")
    .delete()
    .in("id", ids)
    .in("user_id", [userAId, userBId]);

  if (error) throw new Error("Guarded notification fixture cleanup failed.");
  seeded = [];
}

async function cleanupStaleGuardedNotificationFixtures() {
  if (!admin || !userAId || !userBId) return;
  const stale = await admin
    .from("notifications")
    .select("id")
    .in("user_id", [userAId, userBId])
    .like("metadata->>qa_run_id", "part18c-%");
  if (stale.error) throw new Error("Stale guarded notification fixture inspection failed.");
  const ids = (stale.data ?? []).map(({ id }) => id);
  if (ids.length === 0) return;
  const cleanup = await admin
    .from("notifications")
    .delete()
    .in("user_id", [userAId, userBId])
    .in("id", ids);
  if (cleanup.error) throw new Error("Stale guarded notification fixture cleanup failed.");
}

async function cleanupOrphanedControlledTransitionNotifications() {
  if (!admin || !userBId) return;
  const controlledBodies = importCandidates.flatMap(({ title }) => [
    `${title} was added to your Watch Next queue.`,
    `You started watching ${title}.`,
    `You finished watching ${title}.`,
  ]);
  const candidates = await admin
    .from("notifications")
    .select("id, metadata, body")
    .eq("user_id", userBId)
    .eq("metadata->>source", "movie_status_transition")
    .in("body", controlledBodies);
  if (candidates.error) throw new Error("Controlled transition fixture inspection failed.");

  const rows = (candidates.data ?? []).flatMap((row) => {
    const userMovieId =
      row.metadata &&
      typeof row.metadata === "object" &&
      !Array.isArray(row.metadata) &&
      typeof row.metadata.user_movie_id === "string"
        ? row.metadata.user_movie_id
        : null;
    return userMovieId ? [{ id: row.id, userMovieId }] : [];
  });
  if (rows.length === 0) return;

  const existing = await admin
    .from("user_movies")
    .select("id")
    .eq("user_id", userBId)
    .in("id", rows.map(({ userMovieId }) => userMovieId));
  if (existing.error) throw new Error("Controlled transition ownership inspection failed.");
  const existingIds = new Set((existing.data ?? []).map(({ id }) => id));
  const orphanedIds = rows
    .filter(({ userMovieId }) => !existingIds.has(userMovieId))
    .map(({ id }) => id);
  if (orphanedIds.length === 0) return;

  const cleanup = await admin
    .from("notifications")
    .delete()
    .eq("user_id", userBId)
    .in("id", orphanedIds);
  if (cleanup.error) throw new Error("Orphaned controlled transition cleanup failed.");
}

async function cleanupOrphanedControlledListNotifications() {
  if (!admin || !userBId) return;
  const candidates = await admin
    .from("notifications")
    .select("id, metadata, body")
    .eq("user_id", userBId)
    .eq("metadata->>source", "custom_list_membership")
    .like("body", "%Part 18C list %");
  if (candidates.error) throw new Error("Controlled list fixture inspection failed.");
  const rows = (candidates.data ?? []).flatMap((row) => {
    const listId =
      row.metadata &&
      typeof row.metadata === "object" &&
      !Array.isArray(row.metadata) &&
      typeof row.metadata.list_id === "string"
        ? row.metadata.list_id
        : null;
    return listId ? [{ id: row.id, listId }] : [];
  });
  if (rows.length === 0) return;
  const existing = await admin
    .from("lists")
    .select("id")
    .eq("user_id", userBId)
    .in("id", rows.map(({ listId }) => listId));
  if (existing.error) throw new Error("Controlled list ownership inspection failed.");
  const existingIds = new Set((existing.data ?? []).map(({ id }) => id));
  const orphanedIds = rows
    .filter(({ listId }) => !existingIds.has(listId))
    .map(({ id }) => id);
  if (orphanedIds.length === 0) return;
  const cleanup = await admin
    .from("notifications")
    .delete()
    .eq("user_id", userBId)
    .in("id", orphanedIds);
  if (cleanup.error) throw new Error("Orphaned controlled list cleanup failed.");
}

async function pickAbsentImportFixture(page: Page) {
  for (const candidate of importCandidates) {
    await page.goto(`/library?q=${encodeURIComponent(candidate.title)}`);
    if (
      (await page.locator(`article[data-tmdb-id="${candidate.tmdbId}"]`).count()) === 0
    ) {
      return candidate;
    }
  }
  return null;
}

async function completeSingleMovieImport(
  page: Page,
  fixture: (typeof importCandidates)[number],
) {
  await page.goto("/import");
  await uploadCsvFixture(
    page.getByLabel("CSV file"),
    [
      {
        Title: fixture.title,
        "Release Year": fixture.year,
        "TMDB ID": fixture.tmdbId,
        Status: "Want to Watch",
      },
    ],
    "part18c-notification-producer.csv",
  );
  await page.getByRole("button", { name: "Upload and inspect" }).click();
  await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
  await page.getByRole("button", { name: "Preview rows" }).click();
  await expect(page.getByRole("heading", { name: "Preview and validate" })).toBeVisible();
  await page.getByRole("button", { name: "Match with TMDB" }).click();
  await expect(page.getByRole("heading", { name: "Review matches" })).toBeVisible({
    timeout: 120_000,
  });
  await page.getByRole("button", { name: "Review import summary" }).click();
  await expect(page.getByRole("heading", { name: "Confirm import" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("heading", { name: "Import complete" })).toBeVisible({
    timeout: 180_000,
  });
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
  status: "watch_next" | "scheduled" | "watched",
) {
  await page.getByLabel("Status", { exact: true }).selectOption(status);
  if (status === "scheduled") {
    await page.getByLabel("Date", { exact: true }).fill("2099-12-31");
    await page.getByLabel("Time", { exact: true }).fill("20:00");
    await page.getByLabel("Timezone", { exact: true }).fill("UTC");
  }
  await clickAndWaitForMutation(
    page,
    page.getByRole("button", { name: "Save changes" }),
    { success: "Movie details saved." },
  );
}

async function bulkStartWatching(page: Page, movie: ControlledMovie) {
  await page.goto(`/library?q=${encodeURIComponent(movie.title)}`);
  await page.getByRole("button", { name: "Select movies" }).click();
  await page.getByRole("checkbox", { name: `Select ${movie.title}` }).check();
  await page
    .locator("label")
    .filter({ hasText: "Change status" })
    .locator("select")
    .selectOption("currently_watching");
  await page.getByRole("button", { name: "Review status change" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await clickAndWaitForMutation(
    page,
    dialog.getByRole("button", { name: "Change status", exact: true }),
    { success: "1 movie updated." },
  );
}

test.describe("Part 18C-1 guarded notification acceptance", () => {
  test.skip(!authenticatedQaGuard.enabled, authenticatedQaGuard.reason);

  test.beforeAll(async () => {
    if (!developmentTargetGuard.enabled || !authenticatedQaGuard.enabled) return;

    const url = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
    admin = createClient(url, requiredEnvironment("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

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
      .select(categoryPreferenceColumns.join(","))
      .eq("user_id", userBId)
      .single();
    if (preferences.error || !preferences.data) {
      throw new Error("QA User B notification preferences could not be captured.");
    }
    originalCategoryPreferences = preferences.data as unknown as Record<string, boolean>;
    const enableCategories = await userBClient
      .from("user_preferences")
      .update(Object.fromEntries(categoryPreferenceColumns.map((column) => [column, true])))
      .eq("user_id", userBId);
    if (enableCategories.error) {
      throw new Error("QA User B notification categories could not be enabled for acceptance.");
    }
    await cleanupStaleGuardedNotificationFixtures();
    await cleanupOrphanedControlledTransitionNotifications();
    await cleanupOrphanedControlledListNotifications();
  });

  test.afterAll(async () => {
    await cleanupNotifications();
    await cleanupOrphanedControlledTransitionNotifications();
    await cleanupOrphanedControlledListNotifications();
    if (userBClient && originalCategoryPreferences) {
      const restore = await userBClient
        .from("user_preferences")
        .update(originalCategoryPreferences)
        .eq("user_id", userBId);
      if (restore.error) {
        throw new Error("QA User B notification preferences could not be restored.");
      }
    }
    await Promise.all([
      userAClient?.auth.signOut(),
      userBClient?.auth.signOut(),
    ]);
  });

  test("QA User B can open the empty notification feed", async ({
    qaUserBPage,
    qaUserBAudit,
  }) => {
    await qaUserBPage.goto("/notifications");
    await expect(
      qaUserBPage.getByRole("heading", { name: "Notifications", level: 1 }),
    ).toBeVisible();
    await expect(
      qaUserBPage.getByRole("heading", { name: "No notifications yet" }),
    ).toBeVisible();
    await expect(
      qaUserBPage.locator('a[href="/notifications"] span[aria-label$="unread notifications"]'),
    ).toHaveCount(0);
    expectNoUnexpectedBrowserFailures(qaUserBAudit);
  });

  test("read actions, persistence, badge updates, and two-user feed isolation work", async ({
    qaUserAPage,
    qaUserBPage,
    qaUserAAudit,
    qaUserBAudit,
  }) => {
    await seedNotifications();

    await qaUserBPage.goto("/notifications");
    await expect(qaUserBPage.getByRole("heading", { name: userBFirstTitle })).toBeVisible();
    await expect(qaUserBPage.getByRole("heading", { name: userBSecondTitle })).toBeVisible();
    await expect(qaUserBPage.getByText(userATitle)).toHaveCount(0);
    await expect(
      qaUserBPage.locator('a[href="/notifications"] span[aria-label="2 unread notifications"]'),
    ).toHaveCount(2);

    await qaUserBPage
      .getByRole("button", { name: `Mark ${userBFirstTitle} as read` })
      .click();
    await expect(qaUserBPage.getByText("1 unread", { exact: true })).toBeVisible();
    await expect(
      qaUserBPage.locator('a[href="/notifications"] span[aria-label="1 unread notifications"]'),
    ).toHaveCount(2);

    await qaUserBPage.reload();
    await expect(qaUserBPage.getByText("1 unread", { exact: true })).toBeVisible();
    await expect(
      qaUserBPage.getByRole("button", { name: `Mark ${userBFirstTitle} as read` }),
    ).toHaveCount(0);

    await qaUserBPage.getByRole("button", { name: "Mark all as read" }).click();
    await expect(qaUserBPage.getByText("0 unread", { exact: true })).toBeVisible();
    await expect(
      qaUserBPage.locator('a[href="/notifications"] span[aria-label$="unread notifications"]'),
    ).toHaveCount(0);

    await qaUserBPage.reload();
    await expect(qaUserBPage.getByText("0 unread", { exact: true })).toBeVisible();

    await qaUserAPage.goto("/notifications");
    await expect(qaUserAPage.getByRole("heading", { name: userATitle })).toBeVisible();
    await expect(qaUserAPage.getByText(userBFirstTitle)).toHaveCount(0);
    await expect(qaUserAPage.getByText(userBSecondTitle)).toHaveCount(0);

    expectNoUnexpectedBrowserFailures(qaUserAAudit);
    expectNoUnexpectedBrowserFailures(qaUserBAudit);
  });

  test("successful CSV Import V2 completion creates one readable system notification", async ({
    qaUserBPage,
    qaUserBAudit,
  }) => {
    test.setTimeout(300_000);
    const fixture = await pickAbsentImportFixture(qaUserBPage);
    test.skip(!fixture, "Every controlled CSV fixture already exists for QA User B.");
    const movie: ControlledMovie = {
      title: fixture!.title,
      tmdbId: fixture!.tmdbId,
      addedByTest: false,
    };
    const startedAt = new Date(Date.now() - 1_000).toISOString();
    const productNotificationIds: string[] = [];

    try {
      await completeSingleMovieImport(qaUserBPage, fixture!);
      movie.addedByTest = true;

      if (!admin) throw new Error("Guarded notification fixture inspection is unavailable.");
      const created = await admin
        .from("notifications")
        .select("id, user_id")
        .eq("user_id", userBId)
        .eq("type", "system")
        .eq("metadata->>source", "csv_import_v2")
        .gte("created_at", startedAt)
        .order("created_at", { ascending: false })
        .limit(2);
      expect(created.error).toBeNull();
      expect(created.data).toHaveLength(1);
      seeded.push(created.data![0]);
      productNotificationIds.push(created.data![0].id);

      await qaUserBPage.goto("/notifications");
      await expect(
        qaUserBPage.getByRole("heading", { name: "CSV import complete" }),
      ).toBeVisible();
      await expect(qaUserBPage.getByText("1 unread", { exact: true })).toBeVisible();
      await qaUserBPage
        .getByRole("button", { name: "Mark CSV import complete as read" })
        .click();
      await expect(qaUserBPage.getByText("0 unread", { exact: true })).toBeVisible();
      await qaUserBPage.reload();
      await expect(qaUserBPage.getByText("0 unread", { exact: true })).toBeVisible();
      expectNoUnexpectedBrowserFailures(qaUserBAudit, {
        allowedCategories: ["aborted", "next-image-lcp-advice"],
      });
    } finally {
      if (movie.addedByTest) {
        await removeControlledMovie(qaUserBPage, movie);
      }
      if (admin && productNotificationIds.length > 0) {
        const cleanup = await admin
          .from("notifications")
          .delete()
          .eq("user_id", userBId)
          .in("id", productNotificationIds);
        if (cleanup.error) {
          throw new Error("CSV import notification cleanup failed.");
        }
        const removed = new Set(productNotificationIds);
        seeded = seeded.filter(({ id }) => !removed.has(id));
      }
    }
  });

  test("trusted movie status transitions create isolated, persistent notifications", async ({
    qaUserAPage,
    qaUserBPage,
    qaUserAAudit,
    qaUserBAudit,
  }) => {
    test.setTimeout(300_000);
    const fixture = await pickAbsentImportFixture(qaUserBPage);
    test.skip(!fixture, "Every controlled status-transition fixture already exists for QA User B.");
    const movie = await addControlledMovie(qaUserBPage, fixture!.title);
    test.skip(!movie.addedByTest, "The selected status-transition fixture was not isolated.");
    const productNotificationIds: string[] = [];
    let userMovieId = "";

    try {
      if (!admin) throw new Error("Guarded notification fixture inspection is unavailable.");
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
      await saveMovieStatus(qaUserBPage, "watch_next");
      await saveMovieStatus(qaUserBPage, "scheduled");
      await bulkStartWatching(qaUserBPage, movie);
      await openControlledMovie(qaUserBPage, movie);
      await saveMovieStatus(qaUserBPage, "watched");

      const created = await admin
        .from("notifications")
        .select("id, user_id, metadata")
        .eq("user_id", userBId)
        .eq("metadata->>source", "movie_status_transition")
        .eq("metadata->>user_movie_id", userMovieId)
        .order("created_at", { ascending: true });
      expect(created.error).toBeNull();
      expect(created.data).toHaveLength(3);
      expect(created.data!.map(({ metadata }) => metadata.event)).toEqual([
        "added_to_watch_next",
        "scheduled_to_watching",
        "watching_to_watched",
      ]);
      for (const row of created.data!) {
        seeded.push({ id: row.id, user_id: row.user_id });
        productNotificationIds.push(row.id);
      }

      const userARead = await userAClient!
        .from("notifications")
        .select("id")
        .eq("metadata->>source", "movie_status_transition")
        .eq("metadata->>user_movie_id", userMovieId);
      expect(userARead.error).toBeNull();
      expect(userARead.data).toEqual([]);

      await qaUserBPage.goto("/notifications");
      await expect(qaUserBPage.getByText(`${movie.title} was added to your Watch Next queue.`)).toBeVisible();
      await expect(qaUserBPage.getByText(`You started watching ${movie.title}.`)).toBeVisible();
      await expect(qaUserBPage.getByText(`You finished watching ${movie.title}.`)).toBeVisible();
      await expect(qaUserBPage.getByText("3 unread", { exact: true })).toBeVisible();
      await qaUserBPage
        .getByRole("button", { name: "Mark Added to Watch Next as read" })
        .click();
      await expect(qaUserBPage.getByText("2 unread", { exact: true })).toBeVisible();
      await qaUserBPage.reload();
      await expect(qaUserBPage.getByText("2 unread", { exact: true })).toBeVisible();
      await qaUserBPage.getByRole("button", { name: "Mark all as read" }).click();
      await expect(qaUserBPage.getByText("0 unread", { exact: true })).toBeVisible();

      await qaUserAPage.goto("/notifications");
      await expect(qaUserAPage.getByText(movie.title)).toHaveCount(0);
      expectNoUnexpectedBrowserFailures(qaUserAAudit);
      expectNoUnexpectedBrowserFailures(qaUserBAudit, {
        allowedCategories: ["aborted", "next-image-lcp-advice"],
      });
    } finally {
      await removeControlledMovie(qaUserBPage, movie);
      if (admin && userMovieId) {
        const produced = await admin
          .from("notifications")
          .select("id")
          .eq("user_id", userBId)
          .eq("metadata->>source", "movie_status_transition")
          .eq("metadata->>user_movie_id", userMovieId);
        if (produced.error) throw new Error("Movie status notification inspection failed.");
        const cleanupIds = (produced.data ?? []).map(({ id }) => id);
        const cleanup = cleanupIds.length > 0
          ? await admin
          .from("notifications")
          .delete()
          .eq("user_id", userBId)
          .in("id", cleanupIds)
          : { error: null };
        if (cleanup.error) throw new Error("Movie status notification cleanup failed.");
        const removed = new Set([...productNotificationIds, ...cleanupIds]);
        seeded = seeded.filter(({ id }) => !removed.has(id));
      }
    }
  });

  test("custom-list additions create one persistent owner-isolated notification", async ({
    qaUserAPage,
    qaUserBPage,
    qaUserAAudit,
    qaUserBAudit,
  }) => {
    test.setTimeout(240_000);
    const fixture = await pickAbsentImportFixture(qaUserBPage);
    test.skip(!fixture, "Every controlled custom-list fixture already exists for QA User B.");
    const movie = await addControlledMovie(qaUserBPage, fixture!.title);
    test.skip(!movie.addedByTest, "The selected custom-list fixture was not isolated.");
    const list = await createQaList(
      qaUserBPage,
      `Part 18C list ${Date.now()}`,
    );
    let listExists = true;
    const productNotificationIds: string[] = [];

    try {
      await qaUserBPage.getByRole("button", { name: `Add movies to ${list.name}` }).click();
      const dialog = qaUserBPage.getByRole("dialog", {
        name: `Add movies to “${list.name}”`,
      });
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("checkbox", { name: `Add ${movie.title} to ${list.name}` })
        .check();
      await clickAndWaitForMutation(
        qaUserBPage,
        dialog.getByRole("button", { name: "Add Selected Movies (1)" }),
        {
          visible: qaUserBPage.getByRole("button", {
            name: `Remove ${movie.title} from ${list.name}`,
          }),
        },
      );

      if (!admin) throw new Error("Guarded custom-list inspection is unavailable.");
      const created = await admin
        .from("notifications")
        .select("id, user_id, read_at")
        .eq("user_id", userBId)
        .eq("metadata->>source", "custom_list_membership")
        .eq("metadata->>list_id", list.id);
      expect(created.error).toBeNull();
      expect(created.data).toHaveLength(1);
      expect(created.data![0].read_at).toBeNull();
      productNotificationIds.push(created.data![0].id);
      seeded.push({ id: created.data![0].id, user_id: created.data![0].user_id });

      const userARead = await userAClient!
        .from("notifications")
        .select("id")
        .eq("metadata->>source", "custom_list_membership")
        .eq("metadata->>list_id", list.id);
      expect(userARead.error).toBeNull();
      expect(userARead.data).toEqual([]);

      await qaUserBPage.goto(`/lists/${list.id}`);
      await qaUserBPage
        .getByRole("button", { name: `Remove ${movie.title} from ${list.name}` })
        .click();
      const removeDialog = qaUserBPage.getByRole("dialog", {
        name: `Remove “${movie.title}” from this list?`,
      });
      await clickAndWaitForMutation(
        qaUserBPage,
        removeDialog.getByRole("button", { name: "Remove from list" }),
        {},
      );
      await qaUserBPage.reload();
      await expect(
        qaUserBPage.getByRole("heading", { name: "This list is empty" }),
      ).toBeVisible();
      const afterRemoval = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", userBId)
        .eq("metadata->>list_id", list.id);
      expect(afterRemoval.error).toBeNull();
      expect(afterRemoval.data).toHaveLength(1);

      await qaUserBPage.goto("/notifications");
      await expect(
        qaUserBPage.getByText(`${movie.title} was added to ${list.name}.`),
      ).toBeVisible();
      await qaUserBPage
        .getByRole("button", { name: "Mark Added to custom list as read" })
        .click();
      await expect(qaUserBPage.getByText("0 unread", { exact: true })).toBeVisible();
      await qaUserBPage.reload();
      await expect(qaUserBPage.getByText("0 unread", { exact: true })).toBeVisible();

      await qaUserAPage.goto("/notifications");
      await expect(qaUserAPage.getByText(list.name)).toHaveCount(0);
      expectNoUnexpectedBrowserFailures(qaUserAAudit);
      expectNoUnexpectedBrowserFailures(qaUserBAudit, {
        allowedCategories: ["aborted", "next-image-lcp-advice"],
      });
    } finally {
      if (listExists) {
        await deleteQaList(qaUserBPage, list);
        listExists = false;
      }
      await removeControlledMovie(qaUserBPage, movie);
      if (admin && productNotificationIds.length > 0) {
        const cleanup = await admin
          .from("notifications")
          .delete()
          .eq("user_id", userBId)
          .in("id", productNotificationIds);
        if (cleanup.error) throw new Error("Custom-list notification cleanup failed.");
        const removed = new Set(productNotificationIds);
        seeded = seeded.filter(({ id }) => !removed.has(id));
      }
    }
  });

  test("notification RLS blocks anonymous and cross-owner access", async () => {
    expect(userAClient).not.toBeNull();
    expect(userBClient).not.toBeNull();
    await cleanupNotifications();
    await seedNotifications();

    const anonymous = createClient(
      requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
      requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const anonymousRead = await anonymous.from("notifications").select("id").limit(1);
    expect(anonymousRead.error).not.toBeNull();

    const userARead = await userAClient!
      .from("notifications")
      .select("id, title")
      .eq("metadata->>qa_run_id", runId);
    expect(userARead.error).toBeNull();
    expect(userARead.data?.map(({ title }) => title)).toEqual([userATitle]);

    const userBRead = await userBClient!
      .from("notifications")
      .select("id, title")
      .eq("metadata->>qa_run_id", runId)
      .order("created_at", { ascending: true });
    expect(userBRead.error).toBeNull();
    expect(userBRead.data?.map(({ title }) => title)).toEqual([
      userBFirstTitle,
      userBSecondTitle,
    ]);

    const userANotificationId = seeded.find(({ user_id }) => user_id === userAId)?.id;
    expect(userANotificationId).toBeTruthy();
    const crossOwnerRpc = await userBClient!.rpc("watchflow_mark_notification_read", {
      p_notification_id: userANotificationId!,
    });
    expect(crossOwnerRpc.error).toBeNull();
    expect(crossOwnerRpc.data).toBe(false);
  });

  test("notification settings remain available", async ({
    qaUserBPage,
    qaUserBAudit,
  }) => {
    await qaUserBPage.goto("/settings/notifications");
    await expect(
      qaUserBPage.getByRole("heading", { name: "Notifications", level: 2 }),
    ).toBeVisible();
    await expect(
      qaUserBPage.getByText(/Private in-app system notifications are available now/),
    ).toBeVisible();
    await expect(
      qaUserBPage.getByRole("button", { name: "Save notification preferences" }),
    ).toBeVisible();
    await qaUserBPage
      .getByRole("button", { name: "Save notification preferences" })
      .click();
    await expect(
      qaUserBPage.getByText("Notification preferences saved."),
    ).toBeVisible();
    expectNoUnexpectedBrowserFailures(qaUserBAudit);
  });

});
