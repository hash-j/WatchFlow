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
import { mapDiscoveryMovieRows } from "./mapping";
import type { DiscoveryDataset } from "./types";

export const MAX_DISCOVERY_LIBRARY_ROWS = 1000;

export const DISCOVERY_LIBRARY_SELECT = [
  "id",
  "status",
  "favourite",
  "personal_rating",
  "movies!inner(id,title,original_title,poster_path,release_year,runtime_minutes,genres,director,public_rating)",
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

export async function queryOwnedDiscoveryDataset(
  client: SupabaseClient,
  authenticatedUserId: string,
): Promise<DiscoveryDataset> {
  const request = client
    .from("user_movies")
    .select(DISCOVERY_LIBRARY_SELECT, { count: "exact" })
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

export async function getDiscoveryDataset(): Promise<DiscoveryDataset> {
  const { client, user } = await getAuthContext();

  return queryOwnedDiscoveryDataset(client, user.id);
}
