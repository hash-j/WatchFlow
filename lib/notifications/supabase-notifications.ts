import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

import type { LibraryMovieStatus } from "@/lib/movies/types";
import { getTmdbImageUrl } from "@/lib/movies/images";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/error-logging";
import type { PushDeliveryPayload } from "@/lib/push/web-push-adapter";
import { dispatchNotificationEvent } from "./dispatcher";
import { notificationActionUrl } from "./presentation";
import type { NotificationCategory } from "./types";

import {
  NotificationsAuthenticationError,
  NotificationProducerError,
  NotificationsPersistenceError,
} from "./errors";
import { mapNotifications } from "./mapping";

const NOTIFICATION_PAGE_SIZE = 50;

function dispatchCreatedNotification(
  created: boolean,
  payload: PushDeliveryPayload,
) {
  if (!created) return;
  const delivery = dispatchNotificationEvent(payload).catch(() => undefined);
  // The durable in-app notification is already committed. Retain best-effort
  // delivery without making the user-facing mutation wait for push transport.
  after(() => delivery);
}

const categoryPreferenceColumns: Record<NotificationCategory, string> = {
  movie_status: "notification_movie_status_enabled",
  watch_next: "notification_watch_next_enabled",
  custom_lists: "notification_custom_lists_enabled",
  imports: "notification_imports_enabled",
  schedule_reminders: "schedule_reminders_enabled",
};

async function isNotificationCategoryEnabled(
  verifiedUserId: string,
  category: NotificationCategory,
) {
  const client = await createClient();
  const {
    data: { user },
    error: authenticationError,
  } = await client.auth.getUser();
  if (authenticationError || !user || user.id !== verifiedUserId) return false;

  const column = categoryPreferenceColumns[category];
  const { data, error } = await client
    .from("user_preferences")
    .select(column)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    logSupabaseError("notification category preference read failed", error);
    return false;
  }

  return (
    !data ||
    (data as unknown as Record<string, unknown>)[column] !== false
  );
}

function deterministicNotificationId(namespace: string, ...parts: string[]) {
  const characters = createHash("sha256")
    .update(["watchflow", namespace, ...parts].join(":"))
    .digest("hex")
    .slice(0, 32)
    .split("");

  characters[12] = "5";
  characters[16] = ((Number.parseInt(characters[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const value = characters.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function csvImportNotificationId(userId: string, completionId: string) {
  return deterministicNotificationId("csv-import-v2", userId, completionId);
}

export type MovieStatusTransitionSnapshot = {
  userMovieId: string;
  status: LibraryMovieStatus;
  updatedAt: string;
  movieTitle: string;
  moviePosterPath?: string | null;
};

export type MovieStatusNotificationEvent =
  | "scheduled_to_watching"
  | "watching_to_watched"
  | "added_to_watch_next";

export function isMovieStatusNotificationTarget(
  status: LibraryMovieStatus,
) {
  return status === "watch_next" ||
    status === "currently_watching" ||
    status === "watched";
}

export function getMovieStatusNotificationEvent(
  previousStatus: LibraryMovieStatus,
  nextStatus: LibraryMovieStatus,
): MovieStatusNotificationEvent | null {
  if (previousStatus === "scheduled" && nextStatus === "currently_watching") {
    return "scheduled_to_watching";
  }

  if (previousStatus === "currently_watching" && nextStatus === "watched") {
    return "watching_to_watched";
  }

  if (previousStatus !== "watch_next" && nextStatus === "watch_next") {
    return "added_to_watch_next";
  }

  return null;
}

function statusNotificationContent(
  event: MovieStatusNotificationEvent,
  movieTitle: string,
) {
  switch (event) {
    case "scheduled_to_watching":
      return {
        title: "Movie started",
        body: `You started watching ${movieTitle}.`,
        actionPath: "/library",
      };
    case "watching_to_watched":
      return {
        title: "Movie marked watched",
        body: `You finished watching ${movieTitle}.`,
        actionPath: "/library",
      };
    case "added_to_watch_next":
      return {
        title: "Added to Watch Next",
        body: `${movieTitle} was added to your Watch Next queue.`,
        actionPath: "/watch-next",
      };
  }
}

export async function readOwnedMovieStatusTransitionSnapshots(
  client: SupabaseClient,
  userId: string,
  userMovieIds: string[],
): Promise<MovieStatusTransitionSnapshot[]> {
  if (userMovieIds.length === 0) return [];

  const { data, error } = await client
    .from("user_movies")
    .select("id, status, updated_at, movies!inner(title, poster_path)")
    .eq("user_id", userId)
    .in("id", userMovieIds);

  if (error) {
    logSupabaseError("movie status notification snapshot read failed", error);
    throw new NotificationProducerError();
  }

  return (data ?? []).flatMap((row) => {
    const movie = Array.isArray(row.movies) ? row.movies[0] : row.movies;
    if (
      typeof row.id !== "string" ||
      typeof row.status !== "string" ||
      typeof row.updated_at !== "string" ||
      !movie ||
      typeof movie.title !== "string"
    ) {
      return [];
    }

    return [{
      userMovieId: row.id,
      status: row.status as LibraryMovieStatus,
      updatedAt: row.updated_at,
      movieTitle: movie.title,
      moviePosterPath:
        typeof movie.poster_path === "string" ? movie.poster_path : null,
    }];
  });
}

export async function createMovieStatusTransitionNotification(input: {
  verifiedUserId: string;
  snapshot: MovieStatusTransitionSnapshot;
  nextStatus: LibraryMovieStatus;
}) {
  const event = getMovieStatusNotificationEvent(
    input.snapshot.status,
    input.nextStatus,
  );
  if (!event) return { id: null, created: false };
  const category: NotificationCategory =
    event === "added_to_watch_next" ? "watch_next" : "movie_status";
  if (!(await isNotificationCategoryEnabled(input.verifiedUserId, category))) {
    return { id: null, created: false };
  }

  const notificationId = deterministicNotificationId(
    "movie-status-transition",
    input.verifiedUserId,
    input.snapshot.userMovieId,
    event,
    input.snapshot.updatedAt,
  );
  const content = statusNotificationContent(event, input.snapshot.movieTitle);
  const admin = createAdminClient(input.verifiedUserId);
  const { data, error } = await admin
    .from("notifications")
    .upsert(
      {
        id: notificationId,
        user_id: input.verifiedUserId,
        type: "system",
        title: content.title,
        body: content.body,
        action_path: content.actionPath,
        metadata: {
          source: "movie_status_transition",
          category,
          event,
          user_movie_id: input.snapshot.userMovieId,
          movie_title: input.snapshot.movieTitle,
          movie_poster_path: input.snapshot.moviePosterPath ?? null,
        },
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("movie status transition notification creation failed", error);
    throw new NotificationProducerError();
  }

  const created = Boolean(data);
  dispatchCreatedNotification(created, {
    notificationId,
    category,
    title: content.title,
    body: content.body,
    movieTitle: input.snapshot.movieTitle,
    imageUrl: getTmdbImageUrl(input.snapshot.moviePosterPath ?? null, "w342"),
    actionUrl: notificationActionUrl(
      content.actionPath,
      notificationId,
      "push",
    ),
  });
  return { id: notificationId, created };
}

export async function createCustomListMovieAddedNotification(input: {
  verifiedUserId: string;
  listId: string;
  listMovieId: string;
  userMovieId: string;
  listName: string;
  movieTitle: string;
  moviePosterPath?: string | null;
}) {
  const category: NotificationCategory = "custom_lists";
  if (!(await isNotificationCategoryEnabled(input.verifiedUserId, category))) {
    return { id: null, created: false };
  }
  const notificationId = deterministicNotificationId(
    "custom-list-movie-added",
    input.verifiedUserId,
    input.listMovieId,
  );
  const admin = createAdminClient(input.verifiedUserId);
  const content = {
    title: "Added to custom list",
    body: `${input.movieTitle} was added to ${input.listName}.`,
    actionPath: `/lists/${input.listId}`,
  };
  const { data, error } = await admin
    .from("notifications")
    .upsert(
      {
        id: notificationId,
        user_id: input.verifiedUserId,
        type: "system",
        title: content.title,
        body: content.body,
        action_path: content.actionPath,
        metadata: {
          source: "custom_list_membership",
          category,
          event: "movie_added",
          list_id: input.listId,
          list_movie_id: input.listMovieId,
          user_movie_id: input.userMovieId,
          movie_title: input.movieTitle,
          movie_poster_path: input.moviePosterPath ?? null,
        },
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("custom list notification creation failed", error);
    throw new NotificationProducerError();
  }

  const created = Boolean(data);
  dispatchCreatedNotification(created, {
    notificationId,
    category,
    title: content.title,
    body: content.body,
    movieTitle: input.movieTitle,
    imageUrl: getTmdbImageUrl(input.moviePosterPath ?? null, "w342"),
    actionUrl: notificationActionUrl(
      content.actionPath,
      notificationId,
      "push",
    ),
  });
  return { id: notificationId, created };
}

// Same fixed trusted list-membership producer, with one preference read and
// one idempotent insert for a bounded bulk selection instead of one per movie.
export async function createCustomListMoviesAddedNotifications(inputs: Parameters<typeof createCustomListMovieAddedNotification>[0][]) {
  if (!inputs.length) return;
  const owner = inputs[0].verifiedUserId;
  if (inputs.length > 100 || inputs.some(input => input.verifiedUserId !== owner)) throw new NotificationProducerError();
  const category: NotificationCategory = "custom_lists";
  if (!(await isNotificationCategoryEnabled(owner, category))) return;
  const rows = inputs.map(input => ({
    id: deterministicNotificationId("custom-list-movie-added", owner, input.listMovieId), user_id: owner, type: "system",
    title: "Added to custom list", body: `${input.movieTitle} was added to ${input.listName}.`, action_path: `/lists/${input.listId}`,
    metadata: { source: "custom_list_membership", category, event: "movie_added", list_id: input.listId,
      list_movie_id: input.listMovieId, user_movie_id: input.userMovieId, movie_title: input.movieTitle,
      movie_poster_path: input.moviePosterPath ?? null },
  }));
  const admin = createAdminClient(owner);
  const { data, error } = await admin.from("notifications").upsert(rows, { onConflict: "id", ignoreDuplicates: true }).select("id");
  if (error) { logSupabaseError("bulk custom list notification creation failed", error); throw new NotificationProducerError(); }
  const created = new Set((data ?? []).map(row => row.id));
  for (const row of rows) dispatchCreatedNotification(created.has(row.id), {
    notificationId: row.id, category, title: row.title, body: row.body, movieTitle: row.metadata.movie_title,
    imageUrl: getTmdbImageUrl(row.metadata.movie_poster_path, "w342"),
    actionUrl: notificationActionUrl(row.action_path, row.id, "push"),
  });
}

export async function createCsvImportCompletedNotification(input: {
  verifiedUserId: string;
  completionId: string;
}) {
  const category: NotificationCategory = "imports";
  if (!(await isNotificationCategoryEnabled(input.verifiedUserId, category))) {
    return { id: null, created: false };
  }
  const admin = createAdminClient(input.verifiedUserId);
  const notificationId = csvImportNotificationId(
    input.verifiedUserId,
    input.completionId,
  );
  const content = {
    title: "CSV import complete",
    body: "Your CSV import completed successfully. Review your Library for imported movies.",
    actionPath: "/library",
  };
  const { data, error } = await admin
    .from("notifications")
    .upsert(
      {
        id: notificationId,
        user_id: input.verifiedUserId,
        type: "system",
        title: content.title,
        body: content.body,
        action_path: content.actionPath,
        metadata: {
          source: "csv_import_v2",
          category,
          completion_id: input.completionId,
        },
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("CSV import notification creation failed", error);
    throw new NotificationProducerError();
  }

  const created = Boolean(data);
  dispatchCreatedNotification(created, {
    notificationId,
    category,
    title: content.title,
    body: content.body,
    movieTitle: null,
    imageUrl: null,
    actionUrl: notificationActionUrl(
      content.actionPath,
      notificationId,
      "push",
    ),
  });
  return { id: notificationId, created };
}

export async function readOwnedNotifications(
  client: SupabaseClient,
  userId: string,
) {
  const { data, error } = await client
    .from("notifications")
    .select("id, type, title, body, action_path, metadata, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(NOTIFICATION_PAGE_SIZE);

  if (error) {
    logSupabaseError("notification feed read failed", error);
    throw new NotificationsPersistenceError(
      "Your notifications could not be loaded. Please try again.",
    );
  }

  return mapNotifications(data);
}

export async function countUnreadNotifications(
  client: SupabaseClient,
  userId: string,
) {
  const { count, error } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    logSupabaseError("notification unread count failed", error);
    return 0;
  }

  return count ?? 0;
}

export async function getNotificationFeed() {
  const { client, user, profile } = await getAuthContext();
  const [notifications, unreadCount] = await Promise.all([
    readOwnedNotifications(client, user.id),
    countUnreadNotifications(client, user.id),
  ]);

  return {
    notifications,
    unreadCount,
    timeZone:
      typeof profile?.timezone === "string" && profile.timezone
        ? profile.timezone
        : "UTC",
  };
}

async function authenticateNotificationMutation() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    if (error) {
      logSupabaseError("notification mutation authentication failed", error);
    }
    throw new NotificationsAuthenticationError();
  }

  return { client, user };
}

export async function markOwnedNotificationRead(notificationId: string) {
  const { client } = await authenticateNotificationMutation();
  const { data, error } = await client.rpc("watchflow_mark_notification_read", {
    p_notification_id: notificationId,
  });

  if (error) {
    logSupabaseError("notification mark-read failed", error);
    throw new NotificationsPersistenceError();
  }

  return data === true;
}

export async function markAllOwnedNotificationsRead() {
  const { client } = await authenticateNotificationMutation();
  const { data, error } = await client.rpc(
    "watchflow_mark_all_notifications_read",
  );

  if (error) {
    logSupabaseError("notification mark-all-read failed", error);
    throw new NotificationsPersistenceError();
  }

  return typeof data === "number" && Number.isSafeInteger(data) ? data : 0;
}
