import { describe, expect, it, vi } from "vitest";

import {
  MovieProviderError,
  MovieProviderRateLimitError,
} from "../movies/errors";
import type { MovieSearchResult } from "../movies/types";
import type { ValidatedImportRow } from "./types";
import {
  classifyMovieMatch,
  matchImportRows,
  normalizeMovieTitle,
  type ImportMatchingDependencies,
} from "./matching";

function row(
  overrides: Partial<ValidatedImportRow> = {},
): ValidatedImportRow {
  return {
    id: "row_1",
    rowNumber: 2,
    sourceOrder: 0,
    title: "Inception",
    tmdbId: null,
    releaseYear: 2010,
    director: null,
    cast: [],
    genres: [],
    personalRating: null,
    status: null,
    importedStatus: null,
    watchedAt: null,
    watchedDateInterpretation: null,
    review: null,
    priority: 0,
    favourite: false,
    wouldWatchAgain: false,
    suppliedFields: ["title", "releaseYear"],
    issues: [],
    ...overrides,
  };
}

function candidate(
  overrides: Partial<MovieSearchResult> = {},
): MovieSearchResult {
  return {
    tmdbId: 27205,
    title: "Inception",
    originalTitle: null,
    overview: "A dream within a dream.",
    posterPath: "/poster.jpg",
    releaseDate: "2010-07-15",
    voteAverage: 8.4,
    ...overrides,
  };
}

function dependencies(
  searchMovies: ImportMatchingDependencies["searchMovies"],
): ImportMatchingDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue({
      userId: "verified-user",
      client: {},
    }),
    searchMovies,
  };
}

describe("TMDB import matching", () => {
  it("selects an exact title and year match", () => {
    const match = classifyMovieMatch(row(), [candidate()]);
    expect(match).toMatchObject({
      classification: "exact",
      selectedTmdbId: 27205,
    });
  });

  it("uses a valid TMDB ID without a title-search request", async () => {
    const searchMovies = vi.fn();
    const matches = await matchImportRows(
      [row({ tmdbId: 27205 })],
      dependencies(searchMovies),
    );
    expect(matches[0]).toMatchObject({
      classification: "exact",
      selectedTmdbId: 27205,
    });
    expect(searchMovies).not.toHaveBeenCalled();
  });

  it("selects the correct release among movies with the same title", () => {
    const match = classifyMovieMatch(row(), [
      candidate({ tmdbId: 1, releaseDate: "2001-01-01" }),
      candidate({ tmdbId: 2, releaseDate: "2010-07-15" }),
    ]);
    expect(match.classification).toBe("exact");
    expect(match.selectedTmdbId).toBe(2);
  });

  it("requires review when same-title results are ambiguous", () => {
    const match = classifyMovieMatch(row({ releaseYear: null }), [
      candidate({ tmdbId: 1, releaseDate: "2001-01-01" }),
      candidate({ tmdbId: 2, releaseDate: "2010-07-15" }),
    ]);
    expect(match.classification).toBe("ambiguous");
    expect(match.selectedTmdbId).toBeNull();
  });

  it("reports no result", () => {
    expect(classifyMovieMatch(row(), [])).toMatchObject({
      classification: "no_match",
      candidates: [],
    });
  });

  it("keeps a match with a missing poster", () => {
    const match = classifyMovieMatch(row(), [candidate({ posterPath: null })]);
    expect(match.candidates[0].posterPath).toBeNull();
  });

  it("turns a TMDB API failure into a safe row-level error", async () => {
    const matches = await matchImportRows(
      [row()],
      dependencies(vi.fn().mockRejectedValue(new MovieProviderError())),
    );
    expect(matches[0]).toMatchObject({ classification: "error" });
    expect(matches[0].message).toContain("unavailable");
  });

  it("reports TMDB rate limiting with a retryable message", async () => {
    const matches = await matchImportRows(
      [row()],
      dependencies(
        vi.fn().mockRejectedValue(new MovieProviderRateLimitError()),
      ),
    );
    expect(matches[0]).toMatchObject({ classification: "error" });
    expect(matches[0].message).toContain("Wait a moment");
  });

  it("caches duplicate lookups during one match operation", async () => {
    const searchMovies = vi.fn().mockResolvedValue([candidate()]);
    await matchImportRows(
      [row(), row({ id: "row_2", rowNumber: 3, sourceOrder: 1 })],
      dependencies(searchMovies),
    );
    expect(searchMovies).toHaveBeenCalledOnce();
  });

  it("preserves Unicode letters and does not deduplicate distinct Urdu titles", async () => {
    expect(normalizeMovieTitle("دل والے")).toBe("دل والے");
    expect(normalizeMovieTitle("خدا کے لیے")).toBe("خدا کے لیے");

    const searchMovies = vi.fn(async (_session, title: string) => [
      candidate({ tmdbId: title === "دل والے" ? 1 : 2, title }),
    ]);
    const matches = await matchImportRows(
      [
        row({
          id: "row_1",
          title: "دل والے",
          releaseYear: null,
        }),
        row({
          id: "row_2",
          rowNumber: 3,
          sourceOrder: 1,
          title: "خدا کے لیے",
          releaseYear: null,
        }),
      ],
      dependencies(searchMovies),
    );

    expect(searchMovies).toHaveBeenCalledTimes(2);
    expect(searchMovies).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "دل والے",
    );
    expect(searchMovies).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "خدا کے لیے",
    );
    expect(matches.map((match) => match.candidates[0]?.tmdbId)).toEqual([
      1, 2,
    ]);
  });

  it("never starts more than four TMDB lookups concurrently", async () => {
    let active = 0;
    let peak = 0;
    const searchMovies = vi.fn(async (_session, title: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return [candidate({ title })];
    });
    const rows = Array.from({ length: 12 }, (_, index) =>
      row({
        id: `row_${index + 1}`,
        rowNumber: index + 2,
        sourceOrder: index,
        title: `Movie ${index}`,
        releaseYear: null,
      }),
    );

    await matchImportRows(rows, dependencies(searchMovies));
    expect(peak).toBeLessThanOrEqual(4);
  });
});
