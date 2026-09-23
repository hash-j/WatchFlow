import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveSharedMovieMetadata } from "../movies/shared-metadata";
import type { LibraryMovie } from "../movies/types";
import { readUserPreferences } from "../settings/supabase-settings";
import { logSupabaseError } from "../supabase/error-logging";
import { getAuthContext } from "../supabase/auth";
import { createClient } from "../supabase/server";
import { classifyUserMovieInsert } from "./duplicate";
import {
  LibraryPersistenceError,
} from "./errors";
import { mapLibraryMovieRow } from "./mapping";
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
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return { userId: user.id, client: supabase };
}

async function authenticateRequest(): Promise<SupabaseLibrarySession> {
  const { client, user } = await getAuthContext();
  return { userId: user.id, client };
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

export const MAX_WATCH_NEXT_ROWS = 500;

export async function getCurrentUserWatchNextMovies() {
  const session = await authenticateRequest();

  const { client, userId } = session;
  const { data, error } = await client
    .from("user_movies")
    .select(
      "id, status, priority, queue_position, created_at, movies(id, tmdb_id, title, poster_path)",
    )
    .eq("user_id", userId)
    .eq("status", "watch_next")
    .order("priority", { ascending: false })
    .order("queue_position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(0, MAX_WATCH_NEXT_ROWS);

  if (error) {
    logSupabaseError("watch_next queue read failed", error);
    throw new LibraryPersistenceError("Your Watch Next queue could not be loaded.");
  }

  const mapped = Array.isArray(data)
    ? data
        .map(mapLibraryMovieRow)
        .filter((movie): movie is LibraryMovie => Boolean(movie))
    : [];

  return {
    items: mapped.slice(0, MAX_WATCH_NEXT_ROWS),
    truncated: mapped.length > MAX_WATCH_NEXT_ROWS,
  };
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
    resolveSharedMovie: async (session, tmdbId) => {
      const { client, userId } = getSessionClient(session);
      const preferences = await readUserPreferences(client, userId);
      return resolveSharedMovieMetadata({
        client,
        verifiedUserId: userId,
        tmdbId,
        includeAdult: preferences.showAdultResults,
        rateLimitOperation: "details",
      });
    },
    insertUserMovie,
    listUserMovies,
    getUserMovie,
  };
}

export function createSupabaseLibraryRequestDependencies(): LibraryDependencies {
  return {
    ...createSupabaseLibraryDependencies(),
    authenticate: authenticateRequest,
  };
}
