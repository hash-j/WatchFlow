import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MovieProviderError,
  MovieProviderRateLimitError,
  MovieRateLimitConfigurationError,
} from "@/lib/movies/errors";
import { logSupabaseError } from "@/lib/supabase/error-logging";

export const TMDB_RATE_LIMIT_OPERATIONS = [
  "search",
  "details",
  "import_search",
  "import_details",
] as const;

export type TmdbRateLimitOperation =
  (typeof TMDB_RATE_LIMIT_OPERATIONS)[number];

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
  windowSeconds: number;
};

function integer(value: unknown) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

export function parseTmdbRateLimitResult(value: unknown): RateLimitResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const remaining = integer(record.remaining);
  const retryAfterSeconds = integer(record.retry_after_seconds);
  const limit = integer(record.limit);
  const windowSeconds = integer(record.window_seconds);

  if (
    typeof record.allowed !== "boolean" ||
    remaining === null ||
    retryAfterSeconds === null ||
    limit === null ||
    limit < 1 ||
    windowSeconds === null ||
    windowSeconds < 1
  ) {
    return null;
  }

  return {
    allowed: record.allowed,
    remaining,
    retryAfterSeconds,
    limit,
    windowSeconds,
  };
}

function isMissingRateLimitRpc(error: { code?: unknown; message?: unknown }) {
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";

  return (
    code === "PGRST202" ||
    code === "42883" ||
    /watchflow_take_tmdb_rate_limit/i.test(message)
  );
}

export async function enforceTmdbRateLimit(
  client: SupabaseClient,
  operation: TmdbRateLimitOperation,
  cost = 1,
) {
  if (!Number.isSafeInteger(cost) || cost < 1 || cost > 20) {
    throw new MovieProviderError("The movie request was invalid.");
  }

  const { data, error } = await client.rpc(
    "watchflow_take_tmdb_rate_limit",
    {
      p_operation: operation,
      p_cost: cost,
    },
  );

  if (error) {
    logSupabaseError("TMDB rate-limit check failed", error);

    if (isMissingRateLimitRpc(error)) {
      throw new MovieRateLimitConfigurationError();
    }

    throw new MovieProviderError(
      "Movie requests are temporarily unavailable. Please try again.",
    );
  }

  const result = parseTmdbRateLimitResult(data);
  if (!result) {
    throw new MovieProviderError(
      "Movie requests are temporarily unavailable. Please try again.",
    );
  }

  if (!result.allowed) {
    throw new MovieProviderRateLimitError(result.retryAfterSeconds);
  }

  return result;
}
