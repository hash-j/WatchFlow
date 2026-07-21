import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MovieStatusBadge } from "../../components/movies/movie-status-badge";
import type { LibraryMovie, LibraryMovieStatus } from "../movies/types";
import {
  filterLibraryMovies,
  getLibraryFilterCounts,
  getLibraryFilterEmptyMessage,
  normalizeLibraryFilter,
} from "./filters";
import { MOVIE_STATUS_VISUALS } from "./status-visuals";

function createMovie(
  libraryId: string,
  status: LibraryMovieStatus,
): LibraryMovie {
  return {
    libraryId,
    status,
    addedAt: null,
    updatedAt: null,
    personalRating: null,
    review: null,
    priority: 0,
    queuePosition: null,
    scheduledFor: null,
    scheduleTimezone: null,
    scheduleNote: null,
    watchedAt: null,
    wouldWatchAgain: false,
    movie: {
      id: libraryId,
      tmdbId: 1,
      title: libraryId,
      originalTitle: null,
      overview: null,
      posterPath: null,
      backdropPath: null,
      releaseDate: null,
      voteAverage: null,
      runtimeMinutes: null,
      genres: [],
      director: null,
      cast: [],
      originalLanguage: null,
      productionCountries: [],
      trailer: null,
    },
  };
}

const movies = [
  createMovie("watched", "watched"),
  createMovie("queued", "watch_next"),
  createMovie("scheduled", "scheduled"),
];

describe("library watched and unwatched UI", () => {
  it("renders watched and exact unwatched badges with text, icons, and labels", () => {
    const watched = renderToStaticMarkup(
      createElement(MovieStatusBadge, { status: "watched" }),
    );
    const queued = renderToStaticMarkup(
      createElement(MovieStatusBadge, { status: "watch_next" }),
    );

    expect(watched).toContain("Watched");
    expect(watched).toContain("aria-label=");
    expect(watched).toContain("<svg");
    expect(queued).toContain("Watch Next");
    expect(queued).not.toContain(">Unwatched<");
  });

  it("filters All, Watched, and Unwatched and reports counts", () => {
    expect(filterLibraryMovies(movies, "all")).toHaveLength(3);
    expect(filterLibraryMovies(movies, "watched").map((item) => item.libraryId)).toEqual([
      "watched",
    ]);
    expect(
      filterLibraryMovies(movies, "unwatched").map((item) => item.libraryId),
    ).toEqual(["queued", "scheduled"]);
    expect(getLibraryFilterCounts(movies)).toEqual({
      all: 3,
      watched: 1,
      unwatched: 2,
    });
    expect(normalizeLibraryFilter("watched")).toBe("watched");
    expect(normalizeLibraryFilter("invalid")).toBe("all");
  });

  it("provides filter-specific empty messages", () => {
    expect(getLibraryFilterEmptyMessage("watched")).toBe(
      "No watched movies yet.",
    );
    expect(getLibraryFilterEmptyMessage("unwatched")).toBe(
      "You have no unwatched movies.",
    );
  });

  it("does not represent status through color alone", () => {
    for (const visual of Object.values(MOVIE_STATUS_VISUALS)) {
      expect(visual.label.length).toBeGreaterThan(0);
      expect(visual.description.length).toBeGreaterThan(0);
      expect(visual.icon).toBeTypeOf("object");
      expect(visual.badgeClasses.length).toBeGreaterThan(0);
    }

    expect(MOVIE_STATUS_VISUALS.watched.cardAccentClasses).toContain("emerald");
  });
});
