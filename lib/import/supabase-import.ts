import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyUserMovieInsert } from "../library/duplicate";
import { LibraryPersistenceError } from "../library/errors";
import { updateAuthenticatedUserMovie } from "../library/supabase-management";
import { enforceTmdbRateLimit } from "../movies/rate-limit";
import {
  resolveSharedMovieMetadata,
  type SharedMovieReference,
} from "../movies/shared-metadata";
import { tmdbMovieProvider } from "../movies/tmdb-provider";
import { logSupabaseError } from "../supabase/error-logging";
import { createClient } from "../supabase/server";
import type { ImportAuthentication } from "./matching";
import type {
  ConfirmedImportMovie,
  MovieImportDependencies,
  OwnedImportMovie,
} from "./service";

type SupabaseImportSession = ImportAuthentication & { client: SupabaseClient };

function sessionClient(session: ImportAuthentication) {
  return session as SupabaseImportSession;
}

async function authenticate(): Promise<SupabaseImportSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return { userId: user.id, client: supabase };
}

async function existingUserMovie(
  client: SupabaseClient,
  userId: string,
  movieId: string,
) {
  const { data, error } = await client
    .from("user_movies")
    .select("id")
    .eq("user_id", userId)
    .eq("movie_id", movieId)
    .maybeSingle();

  if (error) {
    logSupabaseError("CSV import duplicate lookup failed", error);
    throw new LibraryPersistenceError();
  }

  return Boolean(data);
}

export async function saveImportedMovie(
  session: ImportAuthentication,
  movie: SharedMovieReference,
  imported: ConfirmedImportMovie,
  queuePosition: number | null,
) {
  const { client, userId } = sessionClient(session);
  const movieId = movie.id;
  if (await existingUserMovie(client, userId, movieId)) {
    return { status: "skipped" as const, matchedTitle: movie.title };
  }

  const { error } = await client.from("user_movies").insert({
    user_id: userId,
    movie_id: movieId,
    status: imported.status,
    personal_rating: imported.row.personalRating,
    review: imported.row.review,
    priority: imported.row.priority,
    watched_at: imported.row.watchedAt,
    queue_position: queuePosition,
    favourite: imported.row.favourite,
    would_watch_again: imported.row.wouldWatchAgain,
  });
  const classification = classifyUserMovieInsert(error);

  if (classification === "duplicate") {
    if (await existingUserMovie(client, userId, movieId)) {
      return { status: "skipped" as const, matchedTitle: movie.title };
    }
  }

  if (classification === "error" || error) {
    logSupabaseError("CSV import user_movies insert failed", error!);
    throw new LibraryPersistenceError();
  }

  return { status: "added" as const, matchedTitle: movie.title };
}

async function findOwnedMovie(
  session: ImportAuthentication,
  tmdbId: number,
) {
  const { client, userId } = sessionClient(session);
  const { data, error } = await client
    .from("user_movies")
    .select("id,status,favourite,personal_rating,review,priority,watched_at,would_watch_again,scheduled_for,schedule_timezone,schedule_note,movies!inner(title,tmdb_id)")
    .eq("user_id", userId)
    .eq("movies.tmdb_id", tmdbId)
    .maybeSingle();

  if (error) {
    logSupabaseError("CSV import owned movie lookup failed", error);
    throw new LibraryPersistenceError();
  }

  const related = Array.isArray(data?.movies) ? data.movies[0] : data?.movies;
  const title =
    related &&
    typeof related === "object" &&
    "title" in related &&
    typeof related.title === "string"
      ? related.title
      : null;

  if (!data) return null;

  return {
    id: data.id,
    matchedTitle: title ?? "Stored movie",
    status: data.status as OwnedImportMovie["status"],
    favourite: data.favourite === true,
    personalRating:
      typeof data.personal_rating === "number" ? data.personal_rating : null,
    review: typeof data.review === "string" ? data.review : null,
    priority: typeof data.priority === "number" ? data.priority : 0,
    watchedAt: typeof data.watched_at === "string" ? data.watched_at : null,
    wouldWatchAgain: data.would_watch_again === true,
    scheduledFor:
      typeof data.scheduled_for === "string" ? data.scheduled_for : null,
    scheduleTimezone:
      typeof data.schedule_timezone === "string"
        ? data.schedule_timezone
        : null,
    scheduleNote:
      typeof data.schedule_note === "string" ? data.schedule_note : null,
  };
}

const USER_METADATA_FIELDS = new Set([
  "personalRating",
  "status",
  "watchedDate",
  "review",
  "priority",
  "favourite",
  "wouldWatchAgain",
]);

export async function updateOwnedMovie(
  session: ImportAuthentication,
  owned: OwnedImportMovie,
  imported: ConfirmedImportMovie,
) {
  const { client, userId } = sessionClient(session);
  const supplied = new Set(imported.row.suppliedFields);
  const statusWasSupplied =
    supplied.has("status") && imported.row.importedStatus !== null;
  const watchedDateWasSupplied =
    supplied.has("watchedDate") && imported.row.watchedAt !== null;
  const activeFields = imported.row.suppliedFields.filter(
    (field) =>
      USER_METADATA_FIELDS.has(field) &&
      (field !== "status" || statusWasSupplied) &&
      (field !== "watchedDate" || watchedDateWasSupplied),
  );

  if (activeFields.length === 0) {
    return { status: "skipped" as const, matchedTitle: owned.matchedTitle };
  }

  const status = statusWasSupplied ? imported.status : owned.status;
  const rpcFields = activeFields.filter((field) => field !== "favourite");
  if (rpcFields.length > 0) {
    const updated = await updateAuthenticatedUserMovie(client, userId, owned.id, {
      status,
      personalRating: supplied.has("personalRating")
        ? imported.row.personalRating
        : owned.personalRating,
      review: supplied.has("review") ? imported.row.review : owned.review,
      priority: supplied.has("priority") ? imported.row.priority : owned.priority,
      wouldWatchAgain: supplied.has("wouldWatchAgain")
        ? imported.row.wouldWatchAgain
        : owned.wouldWatchAgain,
      watchedAt: watchedDateWasSupplied ? imported.row.watchedAt : owned.watchedAt,
      watchedAtProvided: watchedDateWasSupplied,
      scheduledFor: status === "scheduled" ? owned.scheduledFor : null,
      timezone: status === "scheduled" ? owned.scheduleTimezone : null,
      scheduleNote: status === "scheduled" ? owned.scheduleNote : null,
    });
    if (!updated) throw new LibraryPersistenceError();
  }

  if (supplied.has("favourite")) {
    const { data, error } = await client
      .from("user_movies")
      .update({ favourite: imported.row.favourite })
      .eq("id", owned.id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      if (error) logSupabaseError("CSV import favourite update failed", error);
      throw new LibraryPersistenceError();
    }
  }

  return { status: "updated" as const, matchedTitle: owned.matchedTitle };
}

async function getNextQueuePosition(session: ImportAuthentication) {
  const { client, userId } = sessionClient(session);
  const { data, error } = await client
    .from("user_movies")
    .select("queue_position")
    .eq("user_id", userId)
    .eq("status", "watch_next")
    .not("queue_position", "is", null)
    .order("queue_position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logSupabaseError("CSV import queue lookup failed", error);
    throw new LibraryPersistenceError();
  }

  const current =
    typeof data?.queue_position === "number" &&
    Number.isSafeInteger(data.queue_position)
      ? data.queue_position
      : 0;
  return current + 1;
}

async function normalizeQueue(session: ImportAuthentication) {
  const { client } = sessionClient(session);
  const { error } = await client.rpc("watchflow_normalize_queue");

  if (error) {
    logSupabaseError("CSV import queue normalization failed", error);
    throw new LibraryPersistenceError();
  }
}

export function createImportMatchingDependencies() {
  return {
    authenticate,
    searchMovies: async (session: ImportAuthentication, query: string) => {
      const { client } = sessionClient(session);
      await enforceTmdbRateLimit(client, "import_search");
      return tmdbMovieProvider.searchMovies(query);
    },
  };
}

export function createMovieImportDependencies(): MovieImportDependencies {
  return {
    authenticate,
    findOwnedMovie,
    updateOwnedMovie,
    resolveSharedMovie: (session, tmdbId) => {
      const { client, userId } = sessionClient(session);
      return resolveSharedMovieMetadata({
        client,
        verifiedUserId: userId,
        tmdbId,
        includeAdult: false,
        rateLimitOperation: "import_details",
      });
    },
    saveMovie: saveImportedMovie,
    getNextQueuePosition,
    normalizeQueue,
  };
}
