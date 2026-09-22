import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeTimeZone } from "@/lib/library/timezone";
import { logSupabaseError } from "@/lib/supabase/error-logging";
import { getAuthContext } from "@/lib/supabase/auth";

import { calculatePersonalStatistics } from "./calculations";
import {
  StatisticsAuthenticationError,
  StatisticsAuthorizationError,
  StatisticsPersistenceError,
  StatisticsRelationshipError,
  StatisticsSchemaError,
} from "./errors";
import { mapStatisticsMovieRows } from "./mapping";
import type { StatisticsDataset } from "./types";

export const MAX_STATISTICS_LIBRARY_ROWS = 1000;

export const STATISTICS_LIBRARY_SELECT = [
  "id",
  "status",
  "favourite",
  "personal_rating",
  "watched_at",
  "scheduled_for",
  "movies!inner(id,title,poster_path,release_year,runtime_minutes,genres)",
].join(",");

type SupabaseStatisticsError = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

export function throwStatisticsQueryError(
  operation: string,
  error: SupabaseStatisticsError,
): never {
  logSupabaseError(operation, error);

  if (error.code === "PGRST301" || error.code === "PGRST302") {
    throw new StatisticsAuthenticationError();
  }

  if (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205"
  ) {
    throw new StatisticsSchemaError();
  }

  if (
    error.code === "PGRST108" ||
    error.code === "PGRST200" ||
    error.code === "PGRST201"
  ) {
    throw new StatisticsRelationshipError();
  }

  if (error.code === "42501") {
    throw new StatisticsAuthorizationError();
  }

  throw new StatisticsPersistenceError();
}

function nonNegativeCount(value: unknown, fallback: number) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : fallback;
}

export async function queryOwnedStatisticsDataset(
  client: SupabaseClient,
  authenticatedUserId: string,
): Promise<StatisticsDataset> {
  const request = client
    .from("user_movies")
    .select(STATISTICS_LIBRARY_SELECT, { count: "exact" })
    .eq("user_id", authenticatedUserId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  const { data, count, error } = await request.range(
    0,
    MAX_STATISTICS_LIBRARY_ROWS - 1,
  );

  if (error) {
    throwStatisticsQueryError("private statistics library query failed", error);
  }

  const movies = mapStatisticsMovieRows(data);
  const totalCount = nonNegativeCount(count, movies.length);

  return {
    movies,
    totalCount,
    truncated: totalCount > movies.length,
  };
}

export async function queryOwnedStatisticsTimezone(
  client: SupabaseClient,
  authenticatedUserId: string,
) {
  const { data, error } = await client
    .from("profiles")
    .select("timezone")
    .eq("id", authenticatedUserId)
    .maybeSingle();

  if (error) {
    throwStatisticsQueryError("private statistics timezone query failed", error);
  }

  return normalizeTimeZone(data?.timezone);
}

export async function getPersonalStatistics() {
  const { client, profile, user } = await getAuthContext();
  const dataset = await queryOwnedStatisticsDataset(client, user.id);
  const timezone = normalizeTimeZone(profile?.timezone);

  return calculatePersonalStatistics(dataset.movies, {
    timezone,
    totalCount: dataset.totalCount,
  });
}
