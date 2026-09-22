import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LibraryMovie } from "@/lib/movies/types";
import { readUserPreferences } from "@/lib/settings/supabase-settings";
import { logSupabaseError } from "@/lib/supabase/error-logging";
import { getRequestSupabaseClient } from "@/lib/supabase/request";

import { LibraryPersistenceError } from "./errors";
import { mapLibraryMovieRow } from "./mapping";
import { compareLocalDate, normalizeTimeZone } from "./timezone";

const DASHBOARD_LIST_LIMIT = 4;
const DASHBOARD_SCHEDULE_WINDOW_HOURS = 26;

type SupabaseReadError = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

export type ScheduleMovieOption = {
  libraryId: string;
  title: string;
};

function throwOverviewError(operation: string, error: SupabaseReadError): never {
  logSupabaseError(operation, error);
  throw new LibraryPersistenceError("Your movies could not be loaded.");
}

function mapRows(data: unknown): LibraryMovie[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map(mapLibraryMovieRow)
    .filter((movie): movie is LibraryMovie => Boolean(movie));
}

function getRelatedMovie(value: unknown): Record<string, unknown> | null {
  const movie = Array.isArray(value) ? value[0] : value;
  return typeof movie === "object" && movie !== null
    ? (movie as Record<string, unknown>)
    : null;
}

function mapScheduleOptions(data: unknown): ScheduleMovieOption[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((value) => {
    if (typeof value !== "object" || value === null) {
      return [];
    }

    const row = value as Record<string, unknown>;
    const movie = getRelatedMovie(row.movies);
    const libraryId = typeof row.id === "string" ? row.id : null;
    const title = typeof movie?.title === "string" ? movie.title.trim() : "";

    return libraryId && title ? [{ libraryId, title }] : [];
  });
}

function dashboardScheduleBounds(now: Date) {
  const radius = DASHBOARD_SCHEDULE_WINDOW_HOURS * 60 * 60 * 1_000;
  return {
    from: new Date(now.getTime() - radius).toISOString(),
    to: new Date(now.getTime() + radius).toISOString(),
  };
}

export async function readDashboardData(
  client: SupabaseClient,
  userId: string,
  fallbackTimezone: string,
  now = new Date(),
) {
  const scheduleBounds = dashboardScheduleBounds(now);
  const countRequest = client
    .from("user_movies")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const nextRequest = client
    .from("user_movies")
    .select("id, status, queue_position, movies(id, tmdb_id, title)")
    .eq("user_id", userId)
    .eq("status", "watch_next")
    .order("queue_position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1);
  const scheduledRequest = client
    .from("user_movies")
    .select(
      "id, status, scheduled_for, schedule_timezone, schedule_note, movies(id, tmdb_id, title)",
    )
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .gte("scheduled_for", scheduleBounds.from)
    .lte("scheduled_for", scheduleBounds.to)
    .order("scheduled_for", { ascending: true });
  const recentRequest = client
    .from("user_movies")
    .select("id, status, created_at, movies(id, tmdb_id, title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(DASHBOARD_LIST_LIMIT);
  const watchedWithDateRequest = client
    .from("user_movies")
    .select(
      "id, status, updated_at, watched_at, personal_rating, movies(id, tmdb_id, title)",
    )
    .eq("user_id", userId)
    .eq("status", "watched")
    .not("watched_at", "is", null)
    .order("watched_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(DASHBOARD_LIST_LIMIT);
  const watchedWithoutDateRequest = client
    .from("user_movies")
    .select(
      "id, status, updated_at, watched_at, personal_rating, movies(id, tmdb_id, title)",
    )
    .eq("user_id", userId)
    .eq("status", "watched")
    .is("watched_at", null)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(DASHBOARD_LIST_LIMIT);

  const [
    countResult,
    nextResult,
    scheduledResult,
    recentResult,
    watchedWithDateResult,
    watchedWithoutDateResult,
    preferences,
  ] = await Promise.all([
    countRequest,
    nextRequest,
    scheduledRequest,
    recentRequest,
    watchedWithDateRequest,
    watchedWithoutDateRequest,
    readUserPreferences(client, userId),
  ]);

  const results = [
    ["dashboard library count failed", countResult.error],
    ["dashboard next movie read failed", nextResult.error],
    ["dashboard scheduled movies read failed", scheduledResult.error],
    ["dashboard recent movies read failed", recentResult.error],
    ["dashboard watched movies read failed", watchedWithDateResult.error],
    ["dashboard watched fallback movies read failed", watchedWithoutDateResult.error],
  ] as const;

  for (const [operation, error] of results) {
    if (error) {
      throwOverviewError(operation, error);
    }
  }

  const recentlyWatched = [
    ...mapRows(watchedWithDateResult.data),
    ...mapRows(watchedWithoutDateResult.data),
  ]
    .sort((left, right) =>
      (right.watchedAt ?? right.updatedAt ?? "").localeCompare(
        left.watchedAt ?? left.updatedAt ?? "",
      ),
    )
    .slice(0, DASHBOARD_LIST_LIMIT);

  return {
    libraryCount: countResult.count ?? 0,
    nextMovie: mapRows(nextResult.data),
    scheduledToday: mapRows(scheduledResult.data).filter(
      (item) =>
        item.scheduledFor &&
        compareLocalDate(
          item.scheduledFor,
          normalizeTimeZone(item.scheduleTimezone, fallbackTimezone),
          now,
        ) === 0,
    ),
    recentlyAdded: mapRows(recentResult.data),
    recentlyWatched,
    preferences,
  };
}

export async function getDashboardData(
  userId: string,
  fallbackTimezone: string,
) {
  return readDashboardData(
    await getRequestSupabaseClient(),
    userId,
    fallbackTimezone,
  );
}

export async function readSchedulePageData(
  client: SupabaseClient,
  userId: string,
) {
  const scheduledRequest = client
    .from("user_movies")
    .select(
      "id, status, scheduled_for, schedule_timezone, schedule_note, movies(id, tmdb_id, title)",
    )
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .not("scheduled_for", "is", null)
    .order("scheduled_for", { ascending: true });
  const optionsRequest = client
    .from("user_movies")
    .select("id, created_at, movies(id, title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  const [scheduledResult, optionsResult, preferences] = await Promise.all([
    scheduledRequest,
    optionsRequest,
    readUserPreferences(client, userId),
  ]);

  if (scheduledResult.error) {
    throwOverviewError("scheduled movies read failed", scheduledResult.error);
  }
  if (optionsResult.error) {
    throwOverviewError("schedule movie options read failed", optionsResult.error);
  }

  return {
    scheduledMovies: mapRows(scheduledResult.data),
    movieOptions: mapScheduleOptions(optionsResult.data),
    preferences,
  };
}

export async function getSchedulePageData(userId: string) {
  return readSchedulePageData(await getRequestSupabaseClient(), userId);
}
