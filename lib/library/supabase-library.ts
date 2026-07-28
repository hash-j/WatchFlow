import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { tmdbMovieProvider } from "../movies/tmdb-provider";
import type { LibraryMovie, MovieDetails } from "../movies/types";
import { createAdminClient } from "../supabase/admin";
import { logSupabaseError } from "../supabase/error-logging";
import { createClient } from "../supabase/server";
import { LibraryPersistenceError } from "./errors";
import { classifyUserMovieInsert } from "./duplicate";
import { mapLibraryMovieRow, toSharedMovieRow } from "./mapping";
import type {
  AuthenticatedLibrarySession,
  LibraryDependencies,
} from "./service";
import { readUserPreferences } from "../settings/supabase-settings";

type SupabaseLibrarySession = AuthenticatedLibrarySession & {
  client: SupabaseClient;
};

function getSessionClient(session: AuthenticatedLibrarySession) {
  return session as SupabaseLibrarySession;
}

async function authenticate(): Promise<SupabaseLibrarySession | null> {
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

  if (error) {
    logSupabaseError("movies metadata upsert failed", error);
    throw new LibraryPersistenceError("The movie metadata could not be saved.");
  }

  if (!id) {
    logSupabaseError("movies metadata upsert returned no ID", {
      message: "Supabase returned no movie ID after a successful upsert.",
    });
    throw new LibraryPersistenceError("The movie metadata could not be saved.");
  }

  return { id };
}

async function insertUserMovie(
  session: AuthenticatedLibrarySession,
  movieId: string,
) {
  const { client } = getSessionClient(session);
  const { data, error } = await client.rpc("watchflow_add_user_movie", {
    p_movie_id: movieId,
  });

  if (!error && data === "duplicate") {
    return "duplicate";
  }

  if (!error && data === "added") {
    return "added";
  }

  const result = classifyUserMovieInsert(error);

  if (result === "error") {
    logSupabaseError("user_movies insert failed", error!);
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
    logSupabaseError("user_movies list failed", error);
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
    logSupabaseError("user_movies detail lookup failed", error);
    throw new LibraryPersistenceError("The movie could not be loaded.");
  }

  return mapLibraryMovieRow(data);
}

export function createSupabaseLibraryDependencies(): LibraryDependencies {
  return {
    authenticate,
    getMovieDetails: async (session, tmdbId) => {
      const { client, userId } = getSessionClient(session);
      const preferences = await readUserPreferences(client, userId);
      return tmdbMovieProvider.getMovieDetails(tmdbId, {
        includeAdult: preferences.showAdultResults,
        language: preferences.preferredLanguage,
      });
    },
    upsertSharedMovie,
    insertUserMovie,
    listUserMovies,
    getUserMovie,
  };
}
