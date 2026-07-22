import { describe, expect, it, vi } from "vitest";

import { AuthenticationRequiredError } from "../library/errors";
import type { MovieDetails } from "../movies/types";
import type { ValidatedImportRow } from "./types";
import {
  importConfirmedMovies,
  type MovieImportDependencies,
} from "./service";

const movie: MovieDetails = {
  tmdbId: 27205,
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
  trailer: { key: "trailer", name: "Trailer", site: "YouTube" },
};

function row(
  overrides: Partial<ValidatedImportRow> = {},
): ValidatedImportRow {
  return {
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
    review: "Great movie",
    priority: 3,
    issues: [],
    ...overrides,
  };
}

function decision(rowId = "row_1") {
  return {
    rowId,
    disposition: "import" as const,
    tmdbId: 27205,
    acceptDefaultStatus: false,
  };
}

function dependencies(
  overrides: Partial<MovieImportDependencies> = {},
): MovieImportDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue({
      userId: "verified-user",
      client: { scope: "authenticated" },
    }),
    getMovieDetails: vi.fn().mockResolvedValue(movie),
    saveMovie: vi.fn().mockResolvedValue({
      status: "imported",
      matchedTitle: movie.title,
    }),
    getNextQueuePosition: vi.fn().mockResolvedValue(1),
    normalizeQueue: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("confirmed CSV import", () => {
  it("rejects an unauthenticated import before TMDB or persistence work", async () => {
    const deps = dependencies({ authenticate: vi.fn().mockResolvedValue(null) });
    await expect(importConfirmedMovies([row()], [decision()], deps)).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    expect(deps.getMovieDetails).not.toHaveBeenCalled();
    expect(deps.saveMovie).not.toHaveBeenCalled();
  });

  it("imports an authenticated matched movie", async () => {
    const deps = dependencies();
    const result = await importConfirmedMovies([row()], [decision()], deps);
    expect(result.summary).toMatchObject({ total: 1, imported: 1 });
    expect(deps.saveMovie).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "verified-user" }),
      movie,
      expect.objectContaining({ status: "watched" }),
      null,
    );
  });

  it("reports a movie already in the user's library", async () => {
    const deps = dependencies({
      saveMovie: vi.fn().mockResolvedValue({
        status: "already_in_library",
        matchedTitle: movie.title,
      }),
    });
    const result = await importConfirmedMovies([row()], [decision()], deps);
    expect(result.summary.alreadyInLibrary).toBe(1);
    expect(result.summary.imported).toBe(0);
  });

  it("passes normalized personal fields to persistence", async () => {
    const saveMovie = vi.fn().mockResolvedValue({
      status: "imported",
      matchedTitle: movie.title,
    });
    await importConfirmedMovies([row()], [decision()], dependencies({ saveMovie }));
    const confirmed = saveMovie.mock.calls[0][2];
    expect(confirmed.row).toMatchObject({
      personalRating: 8.5,
      review: "Great movie",
      priority: 3,
      watchedAt: "2026-07-22T00:00:00.000Z",
    });
  });

  it("keeps another user's identity outside browser input", async () => {
    const saveMovie = vi.fn().mockResolvedValue({
      status: "imported",
      matchedTitle: movie.title,
    });
    await importConfirmedMovies([row()], [decision()], dependencies({ saveMovie }));
    expect(saveMovie.mock.calls[0][0]).toMatchObject({ userId: "verified-user" });
    expect(decision()).not.toHaveProperty("userId");
  });

  it("continues after a partial row failure", async () => {
    const rows = [
      row(),
      row({ id: "row_2", rowNumber: 3, sourceOrder: 1, title: "Arrival" }),
    ];
    const saveMovie = vi
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ status: "imported", matchedTitle: "Arrival" });
    const result = await importConfirmedMovies(
      rows,
      [decision(), decision("row_2")],
      dependencies({ saveMovie }),
    );
    expect(result.summary).toMatchObject({ total: 2, imported: 1, failed: 1 });
  });

  it("appends Watch Next rows sequentially in CSV order", async () => {
    const rows = [
      row({ status: "watch_next" }),
      row({ id: "row_2", rowNumber: 3, sourceOrder: 1, status: "watch_next" }),
    ];
    const saveMovie = vi.fn().mockResolvedValue({
      status: "imported",
      matchedTitle: movie.title,
    });
    const normalizeQueue = vi.fn().mockResolvedValue(undefined);
    await importConfirmedMovies(
      rows,
      [decision(), decision("row_2")],
      dependencies({
        getNextQueuePosition: vi.fn().mockResolvedValue(4),
        saveMovie,
        normalizeQueue,
      }),
    );
    expect(saveMovie.mock.calls.map((call) => call[3])).toEqual([4, 5]);
    expect(normalizeQueue).toHaveBeenCalledOnce();
  });
});
