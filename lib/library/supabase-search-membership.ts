import "server-only";

import { getAuthContext } from "@/lib/supabase/auth";
import { logSupabaseError } from "@/lib/supabase/error-logging";

import { LibraryPersistenceError } from "./errors";

function validTmdbIds(tmdbIds: readonly number[]) {
  return [...new Set(tmdbIds)].filter(
    (tmdbId) => Number.isSafeInteger(tmdbId) && tmdbId > 0,
  );
}

function tmdbIdFromRow(row: unknown) {
  if (!row || typeof row !== "object") return null;

  const related = (row as { movies?: unknown }).movies;
  const movie = Array.isArray(related) ? related[0] : related;
  const tmdbId =
    movie && typeof movie === "object"
      ? (movie as { tmdb_id?: unknown }).tmdb_id
      : null;

  return typeof tmdbId === "number" && Number.isSafeInteger(tmdbId) && tmdbId > 0
    ? tmdbId
    : null;
}

/**
 * Resolves Search ownership in one RLS-bound query for the visible TMDB IDs.
 * The returned IDs describe only the verified request user's `user_movies` rows.
 */
export async function getCurrentUserSearchOwnedTmdbIds(
  tmdbIds: readonly number[],
) {
  const requestedTmdbIds = validTmdbIds(tmdbIds);
  if (requestedTmdbIds.length === 0) return new Set<number>();

  const { client, user } = await getAuthContext();
  const { data, error } = await client
    .from("user_movies")
    .select("movies!inner(tmdb_id)")
    .eq("user_id", user.id)
    .in("movies.tmdb_id", requestedTmdbIds);

  if (error) {
    logSupabaseError("search library membership read failed", error);
    throw new LibraryPersistenceError(
      "Your library status could not be checked. Please try the search again.",
    );
  }

  const ownedTmdbIds = new Set<number>();
  for (const row of Array.isArray(data) ? data : []) {
    const tmdbId = tmdbIdFromRow(row);
    if (tmdbId !== null) ownedTmdbIds.add(tmdbId);
  }

  return ownedTmdbIds;
}
