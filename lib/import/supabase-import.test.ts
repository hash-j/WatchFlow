import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));
vi.mock("../supabase/error-logging", () => ({ logSupabaseError: vi.fn() }));
vi.mock("../supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("../movies/tmdb-provider", () => ({ tmdbMovieProvider: {} }));

import { saveImportedMovie } from "./supabase-import";
import type { ConfirmedImportMovie } from "./service";
import type { MovieDetails } from "../movies/types";

const movie: MovieDetails = {
  tmdbId: 27205,
  title: "Inception",
  originalTitle: null,
  overview: null,
  posterPath: null,
  backdropPath: null,
  releaseDate: "2010-07-15",
  voteAverage: 8.4,
  runtimeMinutes: 148,
  genres: ["Science Fiction"],
  director: "Christopher Nolan",
  cast: [],
  originalLanguage: "en",
  productionCountries: [],
  trailer: null,
};

const imported: ConfirmedImportMovie = {
  tmdbId: 27205,
  status: "watched",
  row: {
    id: "row_1",
    rowNumber: 2,
    sourceOrder: 0,
    title: "Inception",
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
    issues: [],
  },
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

function configureAdmin() {
  const builder = {
    upsert: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: { id: 42 }, error: null }),
  };
  builder.upsert.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  createAdminClientMock.mockReturnValue({ from: vi.fn().mockReturnValue(builder) });
  return builder;
}

beforeEach(() => {
  createAdminClientMock.mockReset();
});

describe("Supabase CSV import persistence", () => {
  it("upserts shared metadata and inserts normalized personal fields", async () => {
    const admin = configureAdmin();
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
      status: "imported",
      matchedTitle: "Inception",
    });
    expect(createAdminClientMock).toHaveBeenCalledWith("verified-user");
    expect(admin.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tmdb_id: 27205, title: "Inception" }),
      { onConflict: "tmdb_id" },
    );
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
    });
  });

  it("uses an existing shared movie without creating duplicate user data", async () => {
    const admin = configureAdmin();
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

    expect(admin.upsert).toHaveBeenCalledOnce();
    expect(result.status).toBe("already_in_library");
    expect(from).toHaveBeenCalledTimes(1);
  });
});
