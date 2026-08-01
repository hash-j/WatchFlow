import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyUserMovieInsert } from "../library/duplicate";
import { LibraryPersistenceError } from "../library/errors";
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
    return { status: "already_in_library" as const, matchedTitle: movie.title };
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
  });
  const classification = classifyUserMovieInsert(error);

  if (classification === "duplicate") {
    if (await existingUserMovie(client, userId, movieId)) {
      return { status: "already_in_library" as const, matchedTitle: movie.title };
    }
  }

  if (classification === "error" || error) {
    logSupabaseError("CSV import user_movies insert failed", error!);
    throw new LibraryPersistenceError();
  }

  return { status: "imported" as const, matchedTitle: movie.title };
}

async function findOwnedMovie(
  session: ImportAuthentication,
  tmdbId: number,
) {
  const { client, userId } = sessionClient(session);
  const { data, error } = await client
    .from("user_movies")
    .select("id, movies!inner(title, tmdb_id)")
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

  return data ? { matchedTitle: title ?? "Stored movie" } : null;
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
