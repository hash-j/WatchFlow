import { describe, expect, it } from "vitest";

import type { LibraryMovieStatus } from "@/lib/movies/types";

import {
  DEFAULT_PICKER_FILTERS,
  MAX_PICKER_EXCLUSIONS,
  PickerInputError,
  filterPickerCandidates,
  getAvailableGenres,
  getPickerMatchReasons,
  matchesPickerFilters,
  parsePickerSearchParams,
  pickRandomMovie,
  pickerFiltersToSearchParams,
  validateExcludedUserMovieIds,
} from "./picker";
import type { DiscoveryMovie, PickerFilters } from "./types";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

function movie(
  overrides: Partial<DiscoveryMovie> = {},
): DiscoveryMovie {
  return {
    userMovieId: firstId,
    movieId: "42",
    status: "want_to_watch",
    favourite: false,
    personalRating: null,
    title: "Inception",
    originalTitle: null,
    posterPath: "/poster.jpg",
    releaseYear: 2010,
    runtimeMinutes: 148,
    genres: ["Action", "Science Fiction", "Thriller"],
    director: "Christopher Nolan",
    publicRating: 8.4,
    ...overrides,
  };
}

function filters(
  overrides: Partial<PickerFilters> = {},
): PickerFilters {
  return { ...DEFAULT_PICKER_FILTERS, ...overrides };
}

describe("picker URL validation", () => {
  it("uses the documented unwatched defaults", () => {
    expect(parsePickerSearchParams({})).toEqual({
      filters: DEFAULT_PICKER_FILTERS,
      warnings: [],
    });
  });

  it("parses every valid filter and canonicalizes an owner genre", () => {
    const result = parsePickerSearchParams(
      {
        genre: " science   fiction ",
        maxRuntime: "150",
        minRating: "7.5",
        mood: "mind_bending",
        period: "2010s",
        watched: "any",
        watchNext: "1",
        favourite: "true",
      },
      ["Drama", "Science Fiction"],
    );

    expect(result.filters).toEqual({
      genre: "Science Fiction",
      maxRuntime: 150,
      minPublicRating: 7.5,
      mood: "mind_bending",
      releasePeriod: "2010s",
      watchedState: "any",
      watchNextOnly: true,
      favouriteOnly: true,
    });
  });

  it("falls back safely for invalid values and returns specific warnings", () => {
    const result = parsePickerSearchParams(
      {
        genre: "Unknown",
        maxRuntime: "91",
        minRating: "11",
        mood: "psychological_profile",
        period: "1970-ish",
        watched: "sometimes",
        watchNext: "maybe",
        favourite: "yes",
      },
      ["Drama"],
    );

    expect(result.filters).toEqual(DEFAULT_PICKER_FILTERS);
    expect(result.warnings).toHaveLength(8);
    expect(result.warnings.join(" ")).toMatch(/public rating/i);
  });

  it("warns that Watch Next overrides a conflicting watched selection", () => {
    const result = parsePickerSearchParams({
      watched: "watched",
      watchNext: "1",
    });

    expect(result.filters).toMatchObject({
      watchedState: "watched",
      watchNextOnly: true,
    });
    expect(result.warnings.join(" ")).toMatch(/overrides/i);
  });

  it("round-trips recognized non-default filters without private IDs", () => {
    const params = pickerFiltersToSearchParams(
      filters({
        genre: "Science Fiction",
        maxRuntime: 150,
        minPublicRating: 7,
        mood: "intense",
        releasePeriod: "2010s",
        watchedState: "any",
        watchNextOnly: true,
        favouriteOnly: true,
      }),
    );

    expect(params.get("genre")).toBe("Science Fiction");
    expect(params.get("minRating")).toBe("7");
    expect(params.get("watchNext")).toBe("1");
    expect(params.toString()).not.toContain("user");
    expect(params.toString()).not.toContain(firstId);
  });
});

describe("picker matching rules", () => {
  it("extracts represented genres safely and alphabetically", () => {
    expect(
      getAvailableGenres([
        movie({ genres: ["Thriller", " Drama "] }),
        movie({ userMovieId: secondId, genres: ["drama", "Comedy"] }),
      ]),
    ).toEqual(["Comedy", "Drama", "Thriller"]);
  });

  it("uses status for watched and unwatched filters", () => {
    expect(
      matchesPickerFilters(
        movie({ status: "watched" }),
        filters({ watchedState: "watched" }),
      ),
    ).toBe(true);
    expect(
      matchesPickerFilters(
        movie({ status: "dropped" }),
        filters(),
      ),
    ).toBe(true);
  });

  it("Watch Next requires the exact queue status and overrides watched state", () => {
    const state = filters({
      watchedState: "watched",
      watchNextOnly: true,
    });
    expect(matchesPickerFilters(movie({ status: "watch_next" }), state)).toBe(
      true,
    );
    expect(matchesPickerFilters(movie({ status: "watched" }), state)).toBe(
      false,
    );
  });

  it.each([
    ["genre", filters({ genre: "Drama" })],
    ["runtime", filters({ maxRuntime: 120 })],
    ["public rating", filters({ minPublicRating: 9 })],
    ["mood", filters({ mood: "funny" })],
    ["period", filters({ releasePeriod: "1990s" })],
    ["favourite", filters({ favouriteOnly: true })],
  ] as const)("rejects a movie that misses the %s filter", (_label, state) => {
    expect(matchesPickerFilters(movie(), state)).toBe(false);
  });

  it("requires both an explicit genre and a mood when both are active", () => {
    const state = filters({
      genre: "Comedy",
      mood: "exciting",
      watchedState: "any",
    });
    expect(
      matchesPickerFilters(movie({ genres: ["Comedy", "Action"] }), state),
    ).toBe(true);
    expect(
      matchesPickerFilters(movie({ genres: ["Comedy"] }), state),
    ).toBe(false);
    expect(
      matchesPickerFilters(movie({ genres: ["Action"] }), state),
    ).toBe(false);
  });

  it("excludes missing metadata only when its corresponding filter is active", () => {
    const missing = movie({
      runtimeMinutes: null,
      publicRating: null,
      releaseYear: null,
    });
    expect(
      matchesPickerFilters(missing, filters({ watchedState: "any" })),
    ).toBe(true);
    expect(
      matchesPickerFilters(
        missing,
        filters({ watchedState: "any", maxRuntime: 180 }),
      ),
    ).toBe(false);
    expect(
      matchesPickerFilters(
        missing,
        filters({ watchedState: "any", minPublicRating: 5 }),
      ),
    ).toBe(false);
    expect(
      matchesPickerFilters(
        missing,
        filters({ watchedState: "any", releasePeriod: "2020s" }),
      ),
    ).toBe(false);
  });

  it("matches release-period boundaries", () => {
    expect(
      matchesPickerFilters(
        movie({ releaseYear: 1979 }),
        filters({ releasePeriod: "before_1980" }),
      ),
    ).toBe(true);
    expect(
      matchesPickerFilters(
        movie({ releaseYear: 1989 }),
        filters({ releasePeriod: "1980s" }),
      ),
    ).toBe(true);
    expect(
      matchesPickerFilters(
        movie({ releaseYear: 1990 }),
        filters({ releasePeriod: "1980s" }),
      ),
    ).toBe(false);
  });

  it("combines all active filters before returning candidates", () => {
    const state = filters({
      genre: "Science Fiction",
      maxRuntime: 150,
      minPublicRating: 8,
      mood: "mind_bending",
      releasePeriod: "2010s",
      favouriteOnly: true,
    });
    const result = filterPickerCandidates(
      [
        movie({ favourite: true }),
        movie({
          userMovieId: secondId,
          favourite: true,
          runtimeMinutes: 151,
        }),
      ],
      state,
    );
    expect(result.map((item) => item.userMovieId)).toEqual([firstId]);
  });
});

describe("picker exclusion and random selection", () => {
  it("accepts empty exclusions, deduplicates UUIDs, and rejects malformed IDs", () => {
    expect(validateExcludedUserMovieIds([])).toEqual([]);
    expect(validateExcludedUserMovieIds([firstId, firstId.toUpperCase()])).toEqual([
      firstId,
    ]);
    expect(() => validateExcludedUserMovieIds(["movie-42"])).toThrow(
      PickerInputError,
    );
  });

  it("rejects an excessive exclusion list", () => {
    const ids = Array.from(
      { length: MAX_PICKER_EXCLUSIONS + 1 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    expect(() => validateExcludedUserMovieIds(ids)).toThrow(/50/);
  });

  it("selects deterministically with an injected random source", () => {
    const result = pickRandomMovie(
      [
        movie(),
        movie({ userMovieId: secondId, movieId: "43", title: "Arrival" }),
      ],
      filters(),
      [],
      () => 0.75,
    );
    expect(result.movie?.userMovieId).toBe(secondId);
    expect(result.eligibleCount).toBe(2);
  });

  it("avoids prior picks while alternatives exist and resets after exhausting the pool", () => {
    const movies = [
      movie(),
      movie({ userMovieId: secondId, movieId: "43", title: "Arrival" }),
    ];
    const another = pickRandomMovie(movies, filters(), [firstId], () => 0);
    expect(another.movie?.userMovieId).toBe(secondId);
    expect(another.exclusionCycleReset).toBe(false);

    const reset = pickRandomMovie(
      movies,
      filters(),
      [firstId, secondId],
      () => 0,
    );
    expect(reset.movie?.userMovieId).toBe(firstId);
    expect(reset.exclusionCycleReset).toBe(true);
  });

  it("returns an honest empty result without relaxing filters", () => {
    const result = pickRandomMovie(
      [movie()],
      filters({ genre: "Comedy" }),
      [],
      () => 0,
    );
    expect(result).toEqual({
      movie: null,
      reasons: [],
      eligibleCount: 0,
      exclusionCycleReset: false,
    });
  });

  it("generates concrete active-filter reasons", () => {
    const state = filters({
      genre: "Science Fiction",
      maxRuntime: 150,
      minPublicRating: 8,
      mood: "mind_bending",
      releasePeriod: "2010s",
      favouriteOnly: true,
    });
    const reasons = getPickerMatchReasons(movie({ favourite: true }), state);
    expect(reasons.join(" ")).toMatch(/unwatched/i);
    expect(reasons.join(" ")).toContain("Science Fiction");
    expect(reasons.join(" ")).toMatch(/public rating/i);
    expect(reasons.join(" ")).toMatch(/favourite/i);
  });

  it("explains an all-any pick instead of rendering an empty reason list", () => {
    expect(
      getPickerMatchReasons(
        movie(),
        filters({ watchedState: "any" }),
      ),
    ).toEqual(["It is eligible under your current library filters."]);
  });

  it.each([
    "want_to_watch",
    "watch_next",
    "scheduled",
    "currently_watching",
    "on_hold",
    "dropped",
  ] as LibraryMovieStatus[])(
    "treats %s as unwatched for the picker",
    (status) => {
      expect(matchesPickerFilters(movie({ status }), filters())).toBe(true);
    },
  );
});
