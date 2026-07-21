import { describe, expect, it } from "vitest";

import type { LibraryMovie, LibraryMovieStatus } from "../movies/types";
import { groupScheduledMovies } from "./schedule";

function createMovie(
  libraryId: string,
  status: LibraryMovieStatus,
  scheduledFor: string | null,
  scheduleTimezone: string | null,
): LibraryMovie {
  return {
    libraryId,
    status,
    addedAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    personalRating: null,
    review: null,
    priority: 0,
    queuePosition: null,
    scheduledFor,
    scheduleTimezone,
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

describe("schedule grouping", () => {
  it("groups Today, Upcoming, and Past in each selected timezone", () => {
    const now = new Date("2026-07-21T21:00:00.000Z");
    const result = groupScheduledMovies(
      [
        createMovie(
          "today-karachi",
          "scheduled",
          "2026-07-21T20:30:00.000Z",
          "Asia/Karachi",
        ),
        createMovie(
          "upcoming",
          "scheduled",
          "2026-07-23T14:00:00.000Z",
          "Asia/Karachi",
        ),
        createMovie(
          "past",
          "scheduled",
          "2026-07-20T14:00:00.000Z",
          "Asia/Karachi",
        ),
        createMovie("not-scheduled", "want_to_watch", null, null),
      ],
      "UTC",
      now,
    );

    expect(result.today.map((item) => item.libraryId)).toEqual([
      "today-karachi",
    ]);
    expect(result.upcoming.map((item) => item.libraryId)).toEqual(["upcoming"]);
    expect(result.past.map((item) => item.libraryId)).toEqual(["past"]);
  });
});
