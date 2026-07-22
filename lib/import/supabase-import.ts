import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyUserMovieInsert } from "../library/duplicate";
import { LibraryPersistenceError } from "../library/errors";
import { toSharedMovieRow } from "../library/mapping";
import { tmdbMovieProvider } from "../movies/tmdb-provider";
import type { MovieDetails } from "../movies/types";
import { createAdminClient } from "../supabase/admin";
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
  movie: MovieDetails,
  imported: ConfirmedImportMovie,
  queuePosition: number | null,
) {
  const { client, userId } = sessionClient(session);
  // Construction is deliberately after auth.getUser() succeeded.
  const admin = createAdminClient(userId);
  const { data: sharedMovie, error: sharedError } = await admin
    .from("movies")
    .upsert(toSharedMovieRow(movie), { onConflict: "tmdb_id" })
    .select("id")
    .single();

  if (sharedError || !sharedMovie?.id) {
    if (sharedError) {
      logSupabaseError("CSV import movie metadata upsert failed", sharedError);
    }
    throw new LibraryPersistenceError("Movie metadata could not be saved.");
  }

  const movieId = String(sharedMovie.id);
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
    searchMovies: (query: string) => tmdbMovieProvider.searchMovies(query),
  };
}

export function createMovieImportDependencies(): MovieImportDependencies {
  return {
    authenticate,
    getMovieDetails: (tmdbId) => tmdbMovieProvider.getMovieDetails(tmdbId),
    saveMovie: saveImportedMovie,
    getNextQueuePosition,
    normalizeQueue,
  };
}
