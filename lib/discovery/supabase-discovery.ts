import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSupabaseError } from "@/lib/supabase/error-logging";
import { getAuthContext } from "@/lib/supabase/auth";

import {
  DiscoveryAuthenticationError,
  DiscoveryAuthorizationError,
  DiscoveryPersistenceError,
  DiscoveryRelationshipError,
  DiscoverySchemaError,
} from "./errors";
import {
  mapDiscoveryMovieRows,
  normalizeDiscoveryGenres,
} from "./mapping";
import { normalizeGenreLabels } from "./moods";
import type { DiscoveryDataset } from "./types";

export const MAX_DISCOVERY_LIBRARY_ROWS = 1000;

export const PICKER_SETUP_SELECT = "movies!inner(genres)";

export const PICKER_LIBRARY_SELECT = [
  "id",
  "status",
  "favourite",
  "movies!inner(id,title,original_title,poster_path,release_year,runtime_minutes,genres,director,public_rating)",
].join(",");

export const RECOMMENDATION_LIBRARY_SELECT = [
  "id",
  "status",
  "favourite",
  "personal_rating",
  "movies!inner(id,title,poster_path,release_year,runtime_minutes,genres,director,public_rating)",
].join(",");

type SupabaseDiscoveryError = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

function throwDiscoveryQueryError(
  operation: string,
  error: SupabaseDiscoveryError,
): never {
  logSupabaseError(operation, error);

  if (error.code === "PGRST301" || error.code === "PGRST302") {
    throw new DiscoveryAuthenticationError();
  }

  if (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205"
  ) {
    throw new DiscoverySchemaError();
  }

  if (
    error.code === "PGRST108" ||
    error.code === "PGRST200" ||
    error.code === "PGRST201"
  ) {
    throw new DiscoveryRelationshipError();
  }

  if (error.code === "42501") {
    throw new DiscoveryAuthorizationError();
  }

  throw new DiscoveryPersistenceError();
}

function nonNegativeCount(value: unknown, fallback: number) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : fallback;
}

function relatedMovie(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const movies = (value as { movies?: unknown }).movies;
  if (Array.isArray(movies)) {
    return movies.find(
      (movie): movie is Record<string, unknown> =>
        typeof movie === "object" && movie !== null,
    ) ?? null;
  }
  return typeof movies === "object" && movies !== null
    ? (movies as Record<string, unknown>)
    : null;
}

async function queryOwnedDiscoveryRows(
  client: SupabaseClient,
  authenticatedUserId: string,
  select: string,
): Promise<DiscoveryDataset> {
  const request = client
    .from("user_movies")
    .select(select, { count: "exact" })
    .eq("user_id", authenticatedUserId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  const { data, count, error } = await request.range(
    0,
    MAX_DISCOVERY_LIBRARY_ROWS - 1,
  );

  if (error) {
    throwDiscoveryQueryError("private discovery library query failed", error);
  }

  const movies = mapDiscoveryMovieRows(data);
  const totalCount = nonNegativeCount(count, movies.length);

  return {
    movies,
    totalCount,
    truncated: totalCount > MAX_DISCOVERY_LIBRARY_ROWS,
  };
}

export function queryOwnedPickerDataset(
  client: SupabaseClient,
  authenticatedUserId: string,
) {
  return queryOwnedDiscoveryRows(
    client,
    authenticatedUserId,
    PICKER_LIBRARY_SELECT,
  );
}

export function queryOwnedRecommendationDataset(
  client: SupabaseClient,
  authenticatedUserId: string,
) {
  return queryOwnedDiscoveryRows(
    client,
    authenticatedUserId,
    RECOMMENDATION_LIBRARY_SELECT,
  );
}

export async function queryOwnedPickerSetup(
  client: SupabaseClient,
  authenticatedUserId: string,
) {
  const { data, count, error } = await client
    .from("user_movies")
    .select(PICKER_SETUP_SELECT, { count: "exact" })
    .eq("user_id", authenticatedUserId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(0, MAX_DISCOVERY_LIBRARY_ROWS - 1);

  if (error) {
    throwDiscoveryQueryError("private picker setup query failed", error);
  }

  const rows = Array.isArray(data) ? data : [];
  const availableGenres = normalizeGenreLabels(
    rows.flatMap((row) => {
      const movie = relatedMovie(row);
      return normalizeDiscoveryGenres(movie?.genres);
    }),
  );
  const totalCount = nonNegativeCount(count, rows.length);

  return {
    availableGenres,
    totalCount,
    truncated: totalCount > MAX_DISCOVERY_LIBRARY_ROWS,
  };
}

export async function getPickerSetupData() {
  const { client, user } = await getAuthContext();
  return queryOwnedPickerSetup(client, user.id);
}

export async function getPickerDataset(): Promise<DiscoveryDataset> {
  const { client, user } = await getAuthContext();
  return queryOwnedPickerDataset(client, user.id);
}

export async function getRecommendationDataset(): Promise<DiscoveryDataset> {
  const { client, user } = await getAuthContext();
  return queryOwnedRecommendationDataset(client, user.id);
}
