import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { tmdbMovieProvider } from "../movies/tmdb-provider";
import type { LibraryMovie, MovieDetails } from "../movies/types";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { LibraryPersistenceError } from "./errors";
import { classifyUserMovieInsert } from "./duplicate";
import { mapLibraryMovieRow, toSharedMovieRow } from "./mapping";
import type {
  AuthenticatedLibrarySession,
  LibraryDependencies,
} from "./service";

type SupabaseLibrarySession = AuthenticatedLibrarySession & {
  client: SupabaseClient;
};

function getSessionClient(session: AuthenticatedLibrarySession) {
  return session as SupabaseLibrarySession;
}

async function authenticate(): Promise<SupabaseLibrarySession | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || !userId) {
    return null;
  }

  return { userId, client: supabase };
}

async function upsertSharedMovie(
  session: AuthenticatedLibrarySession,
  movie: MovieDetails,
) {
  const admin = createAdminClient(session.userId);
  const { data, error } = await admin
    .from("movies")
    .upsert(toSharedMovieRow(movie), { onConflict: "tmdb_id" })
    .select("id")
    .single();

  const id =
    data && (typeof data.id === "string" || typeof data.id === "number")
      ? String(data.id)
      : null;

  if (error || !id) {
    throw new LibraryPersistenceError("The movie metadata could not be saved.");
  }

  return { id };
}

async function insertUserMovie(
  session: AuthenticatedLibrarySession,
  movieId: string,
) {
  const { client, userId } = getSessionClient(session);
  const { error } = await client.from("user_movies").insert({
    user_id: userId,
    movie_id: movieId,
    status: "want_to_watch",
  });
  const result = classifyUserMovieInsert(error);

  if (result === "error") {
    throw new LibraryPersistenceError();
  }

  return result;
}

function mapRows(data: unknown): LibraryMovie[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map(mapLibraryMovieRow)
    .filter((movie): movie is LibraryMovie => Boolean(movie))
    .sort((left, right) =>
      (right.addedAt ?? "").localeCompare(left.addedAt ?? ""),
    );
}

async function listUserMovies(session: AuthenticatedLibrarySession) {
  const { client, userId } = getSessionClient(session);
  const { data, error } = await client
    .from("user_movies")
    .select("*, movies(*)")
    .eq("user_id", userId);

  if (error) {
    throw new LibraryPersistenceError("Your library could not be loaded.");
  }

  return mapRows(data);
}

async function getUserMovie(
  session: AuthenticatedLibrarySession,
  movieId: string,
) {
  const { client, userId } = getSessionClient(session);
  const { data, error } = await client
    .from("user_movies")
    .select("*, movies(*)")
    .eq("user_id", userId)
    .eq("movie_id", movieId)
    .maybeSingle();

  if (error) {
    throw new LibraryPersistenceError("The movie could not be loaded.");
  }

  return mapLibraryMovieRow(data);
}

async function removeUserMovie(
  session: AuthenticatedLibrarySession,
  libraryId: string,
) {
  const { client, userId } = getSessionClient(session);
  const { data, error } = await client
    .from("user_movies")
    .delete()
    .eq("id", libraryId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new LibraryPersistenceError("The movie could not be removed.");
  }

  return Boolean(data);
}

export function createSupabaseLibraryDependencies(): LibraryDependencies {
  return {
    authenticate,
    getMovieDetails: (tmdbId) => tmdbMovieProvider.getMovieDetails(tmdbId),
    upsertSharedMovie,
    insertUserMovie,
    listUserMovies,
    getUserMovie,
    removeUserMovie,
  };
}
