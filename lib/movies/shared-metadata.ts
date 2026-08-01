import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { LibraryPersistenceError } from "@/lib/library/errors";
import { toSharedMovieRow } from "@/lib/library/mapping";
import { MovieProviderError } from "@/lib/movies/errors";
import { enforceTmdbRateLimit, type TmdbRateLimitOperation } from "@/lib/movies/rate-limit";
import { tmdbMovieProvider } from "@/lib/movies/tmdb-provider";
import { validateTmdbId } from "@/lib/movies/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSupabaseError } from "@/lib/supabase/error-logging";

export const TMDB_METADATA_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1_000;
export const TMDB_SHARED_METADATA_LANGUAGE = "en";

export type SharedMovieReference = {
  id: string;
  title: string;
  source: "cache" | "provider";
};

type SharedMovieCacheRow = {
  id?: unknown;
  title?: unknown;
  tmdb_adult?: unknown;
  metadata_language?: unknown;
  metadata_updated_at?: unknown;
};

type ResolveSharedMovieInput = {
  client: SupabaseClient;
  verifiedUserId: string;
  tmdbId: number;
  includeAdult: boolean;
  rateLimitOperation: Extract<
    TmdbRateLimitOperation,
    "details" | "import_details"
  >;
};

const inFlightMetadata = new Map<string, Promise<SharedMovieReference>>();

function string(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function identifier(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

export function isFreshSharedMovieRow(
  row: SharedMovieCacheRow,
  options: {
    includeAdult: boolean;
    language: string;
    now?: number;
  },
) {
  const updatedAt = string(row.metadata_updated_at);
  const updatedTime = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  const now = options.now ?? Date.now();
  const adult =
    typeof row.tmdb_adult === "boolean" ? row.tmdb_adult : null;

  return (
    Boolean(identifier(row.id)) &&
    Boolean(string(row.title)) &&
    Number.isFinite(updatedTime) &&
    updatedTime <= now &&
    now - updatedTime <= TMDB_METADATA_FRESHNESS_MS &&
    string(row.metadata_language) === options.language &&
    adult !== null &&
    (options.includeAdult || adult === false)
  );
}

async function resolveSharedMovieUncached({
  client,
  verifiedUserId,
  tmdbId,
  includeAdult,
  rateLimitOperation,
}: ResolveSharedMovieInput): Promise<SharedMovieReference> {
  const language = TMDB_SHARED_METADATA_LANGUAGE;
  const admin = createAdminClient(verifiedUserId);
  const { data: cached, error: cacheError } = await admin
    .from("movies")
    .select(
      "id, title, tmdb_adult, metadata_language, metadata_updated_at",
    )
    .eq("tmdb_id", tmdbId)
    .maybeSingle();

  if (cacheError) {
    logSupabaseError("shared movie metadata cache lookup failed", cacheError);
    throw new LibraryPersistenceError(
      "Stored movie metadata could not be checked.",
    );
  }

  if (
    cached &&
    isFreshSharedMovieRow(cached, { includeAdult, language })
  ) {
    return {
      id: identifier(cached.id)!,
      title: string(cached.title)!,
      source: "cache",
    };
  }

  await enforceTmdbRateLimit(client, rateLimitOperation);
  const details = await tmdbMovieProvider.getMovieDetails(tmdbId, {
    includeAdult,
    language,
  });
  const localizedDetails = {
    ...details,
    metadataLanguage: language,
  };
  const { data: sharedMovie, error: upsertError } = await admin
    .from("movies")
    .upsert(toSharedMovieRow(localizedDetails), { onConflict: "tmdb_id" })
    .select("id, title")
    .single();

  const id = identifier(sharedMovie?.id);
  const title = string(sharedMovie?.title) ?? details.title;
  if (upsertError || !id) {
    if (upsertError) {
      logSupabaseError("shared movie metadata upsert failed", upsertError);
    }
    throw new LibraryPersistenceError("The movie metadata could not be saved.");
  }

  return { id, title, source: "provider" };
}

export async function resolveSharedMovieMetadata(
  input: ResolveSharedMovieInput,
) {
  if (!input.verifiedUserId) {
    throw new MovieProviderError("Authentication is required.");
  }

  const tmdbId = validateTmdbId(input.tmdbId);
  const language = TMDB_SHARED_METADATA_LANGUAGE;
  const key = [
    input.verifiedUserId,
    input.rateLimitOperation,
    tmdbId,
    input.includeAdult ? "adult" : "standard",
    language,
  ].join(":");
  const active = inFlightMetadata.get(key);
  if (active) {
    return active;
  }

  const pending = resolveSharedMovieUncached({
    ...input,
    tmdbId,
  }).finally(() => {
    inFlightMetadata.delete(key);
  });
  inFlightMetadata.set(key, pending);
  return pending;
}
