import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceTmdbRateLimit = vi.hoisted(() => vi.fn());
const searchMovies = vi.hoisted(() => vi.fn());
const resolveSharedMovieMetadata = vi.hoisted(() => vi.fn());
const updateAuthenticatedUserMovie = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("../supabase/error-logging", () => ({ logSupabaseError: vi.fn() }));
vi.mock("../supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("../movies/tmdb-provider", () => ({
  tmdbMovieProvider: { searchMovies },
}));
vi.mock("../movies/rate-limit", () => ({ enforceTmdbRateLimit }));
vi.mock("../movies/shared-metadata", () => ({
  resolveSharedMovieMetadata,
}));
vi.mock("../library/supabase-management", () => ({
  updateAuthenticatedUserMovie,
}));

import {
  createImportMatchingDependencies,
  createMovieImportDependencies,
  saveImportedMovie,
  updateOwnedMovie,
} from "./supabase-import";
import type { ConfirmedImportMovie } from "./service";
import type { OwnedImportMovie } from "./service";
import type { SharedMovieReference } from "../movies/shared-metadata";
import type { ValidatedImportRow } from "./types";

const movie: SharedMovieReference = {
  id: "42",
  title: "Inception",
  source: "provider",
};

const imported: ConfirmedImportMovie = {
  tmdbId: 27205,
  status: "watched",
  row: {
    id: "row_1",
    rowNumber: 2,
    sourceOrder: 0,
    title: "Inception",
    tmdbId: 27205,
    releaseYear: 2010,
    director: null,
    cast: [],
    genres: [],
    personalRating: 8.5,
    status: "watched",
    importedStatus: "Watched",
    watchedAt: "2026-07-22T00:00:00.000Z",
    watchedDateInterpretation: "2026-07-22 (calendar date)",
    review: "Great",
    priority: 2,
    favourite: true,
    wouldWatchAgain: true,
    suppliedFields: ["title", "tmdbId", "personalRating", "status", "watchedDate", "review", "priority", "favourite", "wouldWatchAgain"],
    issues: [],
  },
};

const owned: OwnedImportMovie = {
  id: "11111111-1111-4111-8111-111111111111",
  matchedTitle: "Inception",
  status: "watched",
  favourite: false,
  personalRating: 7,
  review: "Existing review",
  priority: 4,
  watchedAt: "2024-01-02T00:00:00.000Z",
  wouldWatchAgain: false,
  scheduledFor: null,
  scheduleTimezone: null,
  scheduleNote: null,
};

function chainedLookup(data: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  enforceTmdbRateLimit.mockReset();
  searchMovies.mockReset();
  resolveSharedMovieMetadata.mockReset();
  updateAuthenticatedUserMovie.mockReset();
});

describe("CSV import TMDB rate-limit routing", () => {
  it("uses the import-search bucket before provider matching", async () => {
    const client = {} as SupabaseClient;
    const session = { userId: "verified-user", client };
    enforceTmdbRateLimit.mockResolvedValue({ allowed: true });
    searchMovies.mockResolvedValue([]);

    const result = await createImportMatchingDependencies().searchMovies(
      session,
      "Arrival",
    );

    expect(result).toEqual([]);
    expect(enforceTmdbRateLimit).toHaveBeenCalledWith(
      client,
      "import_search",
    );
    expect(searchMovies).toHaveBeenCalledWith("Arrival");
    expect(enforceTmdbRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      searchMovies.mock.invocationCallOrder[0],
    );
  });

  it("routes uncached import details through the import-details bucket", async () => {
    const client = {} as SupabaseClient;
    const session = { userId: "verified-user", client };
    resolveSharedMovieMetadata.mockResolvedValue(movie);

    await expect(
      createMovieImportDependencies().resolveSharedMovie(session, 27205),
    ).resolves.toEqual(movie);
    expect(resolveSharedMovieMetadata).toHaveBeenCalledWith({
      client,
      verifiedUserId: "verified-user",
      tmdbId: 27205,
      includeAdult: false,
      rateLimitOperation: "import_details",
    });
  });
});

describe("Supabase CSV import persistence", () => {
  it("inserts normalized personal fields for resolved shared metadata", async () => {
    const lookup = chainedLookup(null);
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(lookup)
      .mockReturnValueOnce({ insert });
    const session = {
      userId: "verified-user",
      client: { from } as unknown as SupabaseClient,
    };

    await expect(saveImportedMovie(session, movie, imported, null)).resolves.toEqual({
      status: "added",
      matchedTitle: "Inception",
    });
    expect(lookup.eq).toHaveBeenNthCalledWith(1, "user_id", "verified-user");
    expect(insert).toHaveBeenCalledWith({
      user_id: "verified-user",
      movie_id: "42",
      status: "watched",
      personal_rating: 8.5,
      review: "Great",
      priority: 2,
      watched_at: "2026-07-22T00:00:00.000Z",
      queue_position: null,
      favourite: true,
      would_watch_again: true,
    });
  });

  it("uses an existing shared movie without creating duplicate user data", async () => {
    const lookup = chainedLookup({ id: "existing-library-row" });
    const from = vi.fn().mockReturnValue(lookup);
    const result = await saveImportedMovie(
      {
        userId: "verified-user",
        client: { from } as unknown as SupabaseClient,
      },
      movie,
      imported,
      null,
    );

    expect(result.status).toBe("skipped");
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("preserves all existing metadata when no user metadata column was supplied", async () => {
    const row = {
      ...imported,
      row: {
        ...imported.row,
        suppliedFields: ["title", "tmdbId"] as ValidatedImportRow["suppliedFields"],
      },
    };
    const from = vi.fn();
    await expect(
      updateOwnedMovie(
        { userId: "verified-user", client: { from } as unknown as SupabaseClient },
        owned,
        row,
      ),
    ).resolves.toMatchObject({ status: "skipped" });
    expect(updateAuthenticatedUserMovie).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("updates supplied metadata while preserving an absent Watched Date", async () => {
    updateAuthenticatedUserMovie.mockResolvedValue(true);
    const row = {
      ...imported,
      row: {
        ...imported.row,
        review: "Replacement review",
        watchedAt: null,
        suppliedFields: ["title", "review"] as ValidatedImportRow["suppliedFields"],
      },
    };
    await updateOwnedMovie(
      { userId: "verified-user", client: {} as SupabaseClient },
      owned,
      row,
    );
    expect(updateAuthenticatedUserMovie).toHaveBeenCalledWith(
      expect.anything(),
      "verified-user",
      owned.id,
      expect.objectContaining({
        review: "Replacement review",
        watchedAt: owned.watchedAt,
        watchedAtProvided: false,
        personalRating: owned.personalRating,
        priority: owned.priority,
      }),
    );
  });

  it("applies an explicit valid Watched Date", async () => {
    updateAuthenticatedUserMovie.mockResolvedValue(true);
    await updateOwnedMovie(
      { userId: "verified-user", client: {} as SupabaseClient },
      owned,
      { ...imported, row: { ...imported.row, suppliedFields: ["title", "watchedDate"] } },
    );
    expect(updateAuthenticatedUserMovie).toHaveBeenCalledWith(
      expect.anything(),
      "verified-user",
      owned.id,
      expect.objectContaining({
        watchedAt: imported.row.watchedAt,
        watchedAtProvided: true,
      }),
    );
  });

  it("updates favourite and watch-again using the authenticated owner scope", async () => {
    updateAuthenticatedUserMovie.mockResolvedValue(true);
    const favouriteUpdate = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: owned.id }, error: null }),
    };
    favouriteUpdate.update.mockReturnValue(favouriteUpdate);
    favouriteUpdate.eq.mockReturnValue(favouriteUpdate);
    favouriteUpdate.select.mockReturnValue(favouriteUpdate);
    const from = vi.fn().mockReturnValue(favouriteUpdate);

    await updateOwnedMovie(
      { userId: "verified-user", client: { from } as unknown as SupabaseClient },
      owned,
      {
        ...imported,
        row: {
          ...imported.row,
          suppliedFields: ["title", "favourite", "wouldWatchAgain"],
        },
      },
    );

    expect(updateAuthenticatedUserMovie).toHaveBeenCalledWith(
      expect.anything(),
      "verified-user",
      owned.id,
      expect.objectContaining({ wouldWatchAgain: true }),
    );
    expect(favouriteUpdate.update).toHaveBeenCalledWith({ favourite: true });
    expect(favouriteUpdate.eq).toHaveBeenCalledWith("user_id", "verified-user");
  });
});
