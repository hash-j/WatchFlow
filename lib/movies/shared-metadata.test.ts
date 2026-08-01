import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  enforceTmdbRateLimit: vi.fn(),
  getMovieDetails: vi.fn(),
  logSupabaseError: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/movies/rate-limit", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/movies/rate-limit")>();
  return {
    ...original,
    enforceTmdbRateLimit: mocks.enforceTmdbRateLimit,
  };
});
vi.mock("@/lib/movies/tmdb-provider", () => ({
  tmdbMovieProvider: {
    getMovieDetails: mocks.getMovieDetails,
  },
}));
vi.mock("@/lib/supabase/error-logging", () => ({
  logSupabaseError: mocks.logSupabaseError,
}));

import {
  isFreshSharedMovieRow,
  resolveSharedMovieMetadata,
  TMDB_METADATA_FRESHNESS_MS,
  TMDB_SHARED_METADATA_LANGUAGE,
} from "./shared-metadata";

const client = { rpc: vi.fn() } as unknown as SupabaseClient;
const movieDetails = {
  tmdbId: 27205,
  adult: false,
  title: "Inception",
  originalTitle: null,
  overview: "A dream within a dream.",
  posterPath: "/poster.jpg",
  backdropPath: "/backdrop.jpg",
  releaseDate: "2010-07-15",
  voteAverage: 8.4,
  runtimeMinutes: 148,
  genres: ["Science Fiction"],
  director: "Christopher Nolan",
  cast: [{ name: "Leonardo DiCaprio", character: "Cobb" }],
  originalLanguage: "en",
  productionCountries: ["United States of America"],
  trailer: null,
};

function installAdminResult(
  cache: { data: unknown; error: unknown },
  upsert: { data: unknown; error: unknown } = {
    data: { id: "shared-id", title: "Inception" },
    error: null,
  },
) {
  const upsertResult = {
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(upsert),
  };
  upsertResult.select.mockReturnValue(upsertResult);

  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(cache),
    upsert: vi.fn().mockReturnValue(upsertResult),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const admin = { from: vi.fn().mockReturnValue(query) };
  mocks.createAdminClient.mockReturnValue(admin);

  return { query };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enforceTmdbRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 19,
  });
  mocks.getMovieDetails.mockResolvedValue(movieDetails);
});

describe("shared TMDB metadata freshness", () => {
  it("requires a current timestamp, locale, and known adult classification", () => {
    const now = Date.parse("2026-07-30T12:00:00.000Z");
    const fresh = {
      id: "shared-id",
      title: "Inception",
      tmdb_adult: false,
      metadata_language: "en",
      metadata_updated_at: new Date(
        now - TMDB_METADATA_FRESHNESS_MS,
      ).toISOString(),
    };

    expect(
      isFreshSharedMovieRow(fresh, {
        includeAdult: false,
        language: "en",
        now,
      }),
    ).toBe(true);
    expect(
      isFreshSharedMovieRow(
        {
          ...fresh,
          metadata_updated_at: new Date(
            now - TMDB_METADATA_FRESHNESS_MS - 1,
          ).toISOString(),
        },
        { includeAdult: false, language: "en", now },
      ),
    ).toBe(false);
    expect(
      isFreshSharedMovieRow(
        { ...fresh, tmdb_adult: null },
        { includeAdult: false, language: "en", now },
      ),
    ).toBe(false);
    expect(
      isFreshSharedMovieRow(fresh, {
        includeAdult: false,
        language: "ur",
        now,
      }),
    ).toBe(false);
  });

  it("reuses safe persistent metadata without consuming TMDB allowance", async () => {
    const { query } = installAdminResult({
      data: {
        id: "shared-id",
        title: "Inception",
        tmdb_adult: false,
        metadata_language: "en",
        metadata_updated_at: new Date().toISOString(),
      },
      error: null,
    });

    await expect(
      resolveSharedMovieMetadata({
        client,
        verifiedUserId: "verified-user",
        tmdbId: 27205,
        includeAdult: false,
        rateLimitOperation: "details",
      }),
    ).resolves.toEqual({
      id: "shared-id",
      title: "Inception",
      source: "cache",
    });
    expect(mocks.createAdminClient).toHaveBeenCalledWith("verified-user");
    expect(mocks.enforceTmdbRateLimit).not.toHaveBeenCalled();
    expect(mocks.getMovieDetails).not.toHaveBeenCalled();
    expect(query.upsert).not.toHaveBeenCalled();
  });

  it("refreshes stale metadata through rate-limited server logic and upserts by TMDB ID", async () => {
    const { query } = installAdminResult({
      data: {
        id: "shared-id",
        title: "Inception",
        tmdb_adult: false,
        metadata_language: "en",
        metadata_updated_at: "2020-01-01T00:00:00.000Z",
      },
      error: null,
    });

    await expect(
      resolveSharedMovieMetadata({
        client,
        verifiedUserId: "verified-user",
        tmdbId: 27205,
        includeAdult: false,
        rateLimitOperation: "details",
      }),
    ).resolves.toMatchObject({ source: "provider", id: "shared-id" });

    expect(mocks.enforceTmdbRateLimit).toHaveBeenCalledWith(client, "details");
    expect(mocks.getMovieDetails).toHaveBeenCalledWith(27205, {
      includeAdult: false,
      language: "en",
    });
    expect(query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tmdb_id: 27205,
        tmdb_adult: false,
        metadata_language: "en",
      }),
      { onConflict: "tmdb_id" },
    );
  });

  it("deduplicates simultaneous refreshes for the same user and cache key", async () => {
    installAdminResult({ data: null, error: null });
    let release!: () => void;
    mocks.getMovieDetails.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(movieDetails);
        }),
    );
    const input = {
      client,
      verifiedUserId: "verified-user",
      tmdbId: 27206,
      includeAdult: false,
      rateLimitOperation: "details" as const,
    };

    const first = resolveSharedMovieMetadata(input);
    const second = resolveSharedMovieMetadata(input);
    await vi.waitFor(() => {
      expect(mocks.getMovieDetails).toHaveBeenCalledOnce();
    });
    release();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(mocks.createAdminClient).toHaveBeenCalledOnce();
    expect(mocks.enforceTmdbRateLimit).toHaveBeenCalledOnce();
    expect(mocks.getMovieDetails).toHaveBeenCalledOnce();
  });

  it("uses one canonical locale for the shared cache", () => {
    expect(TMDB_SHARED_METADATA_LANGUAGE).toBe("en");
  });
});
