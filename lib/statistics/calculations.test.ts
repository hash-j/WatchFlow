import { describe, expect, it } from "vitest";

import {
  calculatePersonalStatistics,
  MAX_STATISTICS_GENRES,
  MAX_STATISTICS_MOVIES,
  STATISTICS_TIMELINE_MONTHS,
} from "./calculations";
import {
  formatStatisticsRating,
  formatStatisticsRuntime,
} from "./formatting";
import type { StatisticsMovieRecord } from "./types";

const NOW = new Date("2026-08-02T12:00:00.000Z");

function movie(
  overrides: Partial<StatisticsMovieRecord> = {},
): StatisticsMovieRecord {
  return {
    userMovieId: "11111111-1111-4111-8111-111111111111",
    movieId: "42",
    status: "want_to_watch",
    favourite: false,
    personalRating: null,
    watchedDate: null,
    scheduledFor: null,
    title: "Inception",
    posterPath: null,
    releaseYear: 2010,
    runtimeMinutes: 148,
    genres: ["Science Fiction", "Thriller"],
    ...overrides,
  };
}

function calculate(
  movies: readonly StatisticsMovieRecord[],
  options: Parameters<typeof calculatePersonalStatistics>[1] = {},
) {
  return calculatePersonalStatistics(movies, {
    now: NOW,
    timezone: "UTC",
    ...options,
  });
}

describe("personal statistics summary", () => {
  it("limits full-library iteration to aggregation, genres, and timeline", () => {
    let iterations = 0;
    const records = [
      movie({ status: "watched", watchedDate: "2026-08-01" }),
      movie({ movieId: "43", status: "watch_next" }),
    ];
    const tracked = new Proxy(records, {
      get(target, property, receiver) {
        if (property === Symbol.iterator) {
          iterations += 1;
        }
        return Reflect.get(target, property, receiver);
      },
    });

    calculate(tracked);

    expect(iterations).toBe(3);
  });

  it("returns an explicit empty-library result without inventing unavailable values", () => {
    const result = calculate([]);

    expect(result.emptyState).toEqual({
      emptyLibrary: true,
      noWatchedMovies: true,
      noPersonalRatings: true,
    });
    expect(result.summary).toMatchObject({
      totalMovies: 0,
      watchedMovies: 0,
      unwatchedMovies: 0,
      watchNextMovies: 0,
      favouriteMovies: 0,
      scheduledMovies: 0,
      averagePersonalRating: null,
      ratedMovies: 0,
      totalWatchedRuntimeMinutes: null,
      watchedRuntimeMovies: 0,
      watchedThisMonth: 0,
      watchedThisYear: 0,
    });
    expect(result.statusBreakdown).toEqual([]);
    expect(result.genres).toEqual([]);
    expect(result.timeline).toHaveLength(STATISTICS_TIMELINE_MONTHS);
    expect(result.timeline.every((entry) => entry.count === 0)).toBe(true);
  });

  it("distinguishes a populated library with no watched movies", () => {
    const result = calculate([
      movie({ status: "want_to_watch" }),
      movie({ status: "watch_next", movieId: "43" }),
    ]);

    expect(result.emptyState).toEqual({
      emptyLibrary: false,
      noWatchedMovies: true,
      noPersonalRatings: true,
    });
    expect(result.summary.watchedMovies).toBe(0);
    expect(result.summary.unwatchedMovies).toBe(2);
  });

  it("calculates total, watched, unwatched, Watch Next, favourite, and scheduled counts from exact personal states", () => {
    const movies = [
      movie({ status: "watched", favourite: true }),
      movie({ movieId: "43", status: "watch_next" }),
      movie({
        movieId: "44",
        status: "scheduled",
        scheduledFor: "2026-08-10T18:00:00.000Z",
      }),
      movie({ movieId: "45", status: "scheduled", scheduledFor: null }),
      movie({
        movieId: "46",
        status: "want_to_watch",
        scheduledFor: "2026-08-12T18:00:00.000Z",
      }),
      movie({ movieId: "47", status: "currently_watching", favourite: true }),
      movie({ movieId: "48", status: "on_hold" }),
      movie({ movieId: "49", status: "dropped" }),
    ];

    expect(calculate(movies).summary).toMatchObject({
      totalMovies: 8,
      watchedMovies: 1,
      unwatchedMovies: 7,
      watchNextMovies: 1,
      favouriteMovies: 2,
      scheduledMovies: 1,
    });
  });

  it("averages only non-null valid personal ratings, including the zero boundary", () => {
    const result = calculate([
      movie({ personalRating: 0 }),
      movie({ movieId: "43", personalRating: 7.4 }),
      movie({ movieId: "44", personalRating: 10 }),
      movie({ movieId: "45", personalRating: null }),
    ]);

    expect(result.summary.ratedMovies).toBe(3);
    expect(result.summary.averagePersonalRating).toBe(5.8);
  });

  it("keeps the average unavailable when every personal rating is null", () => {
    const result = calculate([movie(), movie({ movieId: "43" })]);

    expect(result.summary.ratedMovies).toBe(0);
    expect(result.summary.averagePersonalRating).toBeNull();
    expect(result.emptyState.noPersonalRatings).toBe(true);
  });

  it("sums only known positive runtimes from watched movies", () => {
    const result = calculate([
      movie({ status: "watched", runtimeMinutes: 148 }),
      movie({ movieId: "43", status: "watched", runtimeMinutes: 95 }),
      movie({ movieId: "44", status: "watched", runtimeMinutes: null }),
      movie({ movieId: "45", status: "watch_next", runtimeMinutes: 240 }),
    ]);

    expect(result.summary.totalWatchedRuntimeMinutes).toBe(243);
    expect(result.summary.watchedRuntimeMovies).toBe(2);
  });

  it("does not turn missing watched runtime metadata into zero minutes", () => {
    const result = calculate([
      movie({ status: "watched", runtimeMinutes: null }),
      movie({ movieId: "43", status: "watched", runtimeMinutes: null }),
    ]);

    expect(result.summary.totalWatchedRuntimeMinutes).toBeNull();
    expect(result.summary.watchedRuntimeMovies).toBe(0);
  });

  it("counts watched dates in the current month and year without using created dates", () => {
    const result = calculate([
      movie({ status: "watched", watchedDate: "2026-08-01" }),
      movie({ movieId: "43", status: "watched", watchedDate: "2026-07-31" }),
      movie({ movieId: "44", status: "watched", watchedDate: "2025-08-01" }),
      movie({ movieId: "45", status: "watched", watchedDate: null }),
      movie({ movieId: "46", status: "watch_next", watchedDate: "2026-08-02" }),
    ]);

    expect(result.summary.watchedThisMonth).toBe(1);
    expect(result.summary.watchedThisYear).toBe(2);
  });

  it("uses the profile timezone to select the current local reporting period", () => {
    const boundaryNow = new Date("2026-08-31T20:30:00.000Z");
    const records = [
      movie({ status: "watched", watchedDate: "2026-09-01" }),
      movie({ movieId: "43", status: "watched", watchedDate: "2026-08-31" }),
    ];

    const karachi = calculate(records, {
      now: boundaryNow,
      timezone: "Asia/Karachi",
    });
    const utc = calculate(records, { now: boundaryNow, timezone: "UTC" });

    expect(karachi.period.currentMonthKey).toBe("2026-09");
    expect(karachi.summary.watchedThisMonth).toBe(1);
    expect(utc.period.currentMonthKey).toBe("2026-08");
    expect(utc.summary.watchedThisMonth).toBe(1);
  });
});

describe("statistics distributions", () => {
  it("builds a status distribution whose text counts sum to the analyzed library", () => {
    const statuses = [
      "want_to_watch",
      "watch_next",
      "scheduled",
      "currently_watching",
      "watched",
      "on_hold",
      "dropped",
    ] as const;
    const result = calculate(
      statuses.map((status, index) =>
        movie({ movieId: String(100 + index), status }),
      ),
    );

    expect(result.statusBreakdown.map((entry) => entry.status)).toEqual(statuses);
    expect(
      result.statusBreakdown.reduce((sum, entry) => sum + entry.count, 0),
    ).toBe(statuses.length);
    expect(result.statusBreakdown.every((entry) => entry.label.length > 0)).toBe(
      true,
    );
  });

  it("retains unknown statuses explicitly and treats them as unwatched", () => {
    const result = calculate([
      movie({ status: "unknown" }),
      movie({ movieId: "43", status: "watched" }),
    ]);

    expect(result.summary.unwatchedMovies).toBe(1);
    expect(result.statusBreakdown).toContainEqual({
      status: "unknown",
      label: "Unknown status",
      count: 1,
      percentage: 50,
    });
    expect(
      result.statusBreakdown.reduce((sum, entry) => sum + entry.count, 0),
    ).toBe(result.coverage.analyzedMovies);
  });

  it("sorts common genres by count then label, calculates library percentages, and caps output", () => {
    const records = [
      movie({ genres: ["Thriller", "Drama"] }),
      movie({ movieId: "43", genres: ["Drama", "Comedy"] }),
      movie({ movieId: "44", genres: ["Thriller", "Action"] }),
      movie({
        movieId: "45",
        genres: ["Western", "War", "Mystery", "History", "Family", "Crime"],
      }),
    ];
    const result = calculate(records);

    expect(result.genres.slice(0, 4)).toEqual([
      { genre: "Drama", count: 2, percentage: 50 },
      { genre: "Thriller", count: 2, percentage: 50 },
      { genre: "Action", count: 1, percentage: 25 },
      { genre: "Comedy", count: 1, percentage: 25 },
    ]);
    expect(result.genres).toHaveLength(MAX_STATISTICS_GENRES);
  });

  it("groups watched movies into twelve chronological months and includes zero months", () => {
    const result = calculate([
      movie({ status: "watched", watchedDate: "2025-09-12" }),
      movie({ movieId: "43", status: "watched", watchedDate: "2026-08-01" }),
      movie({ movieId: "44", status: "watched", watchedDate: "2026-08-02" }),
      movie({ movieId: "45", status: "watched", watchedDate: null }),
      movie({ movieId: "46", status: "watch_next", watchedDate: "2026-07-01" }),
      movie({ movieId: "47", status: "watched", watchedDate: "2025-08-01" }),
    ]);

    expect(result.timeline).toHaveLength(STATISTICS_TIMELINE_MONTHS);
    expect(result.timeline[0]?.monthKey).toBe("2025-09");
    expect(result.timeline.at(-1)?.monthKey).toBe("2026-08");
    expect(result.timeline.find((entry) => entry.monthKey === "2025-09")?.count).toBe(1);
    expect(result.timeline.find((entry) => entry.monthKey === "2026-07")?.count).toBe(0);
    expect(result.timeline.find((entry) => entry.monthKey === "2026-08")?.count).toBe(2);
  });

  it("places valid personal ratings into documented inclusive upper-bound ranges", () => {
    const ratings = [0, 2, 2.1, 4, 4.1, 6, 6.1, 8, 8.1, 10];
    const result = calculate(
      ratings.map((personalRating, index) =>
        movie({ movieId: String(100 + index), personalRating }),
      ),
    );

    expect(result.ratingDistribution.map((entry) => entry.count)).toEqual([
      2, 2, 2, 2, 2,
    ]);
    expect(result.ratingDistribution.map((entry) => entry.percentage)).toEqual([
      20, 20, 20, 20, 20,
    ]);
  });
});

describe("watched movie lists", () => {
  it("sorts top-rated watched movies by personal rating with stable ties and a five-item limit", () => {
    const result = calculate([
      movie({ movieId: "1", title: "Zulu", status: "watched", personalRating: 10, watchedDate: "2026-08-01" }),
      movie({ movieId: "2", title: "Alpha", status: "watched", personalRating: 10, watchedDate: "2026-08-02" }),
      movie({ movieId: "3", title: "Beta", status: "watched", personalRating: 10, watchedDate: "2026-08-02" }),
      movie({ movieId: "4", title: "Four", status: "watched", personalRating: 9 }),
      movie({ movieId: "5", title: "Five", status: "watched", personalRating: 8 }),
      movie({ movieId: "6", title: "Six", status: "watched", personalRating: 7 }),
      movie({ movieId: "7", title: "Unrated", status: "watched", personalRating: null }),
      movie({ movieId: "8", title: "Not watched", status: "watch_next", personalRating: 10 }),
    ]);

    expect(result.topRatedWatched).toHaveLength(MAX_STATISTICS_MOVIES);
    expect(result.topRatedWatched.map((entry) => entry.title)).toEqual([
      "Alpha",
      "Beta",
      "Zulu",
      "Four",
      "Five",
    ]);
    expect(result.topRatedWatched.every((entry) => entry.personalRating !== null)).toBe(true);
  });

  it("sorts recently watched by watched date, uses stable title ties, and never substitutes a missing date", () => {
    const result = calculate([
      movie({ movieId: "1", title: "Zulu", status: "watched", watchedDate: "2026-08-02" }),
      movie({ movieId: "2", title: "Alpha", status: "watched", watchedDate: "2026-08-02" }),
      movie({ movieId: "3", title: "Three", status: "watched", watchedDate: "2026-08-01" }),
      movie({ movieId: "4", title: "Four", status: "watched", watchedDate: "2026-07-31" }),
      movie({ movieId: "5", title: "Five", status: "watched", watchedDate: "2026-07-30" }),
      movie({ movieId: "6", title: "Six", status: "watched", watchedDate: "2026-07-29" }),
      movie({ movieId: "7", title: "Missing", status: "watched", watchedDate: null }),
      movie({ movieId: "8", title: "Unwatched", status: "watch_next", watchedDate: "2026-08-03" }),
    ]);

    expect(result.recentlyWatched).toHaveLength(MAX_STATISTICS_MOVIES);
    expect(result.recentlyWatched.map((entry) => entry.title)).toEqual([
      "Alpha",
      "Zulu",
      "Three",
      "Four",
      "Five",
    ]);
    expect(result.recentlyWatched.some((entry) => entry.title === "Missing")).toBe(false);
  });
});

describe("statistics value formatting", () => {
  it("formats watched runtime in hours and minutes and preserves unavailable state", () => {
    expect(formatStatisticsRuntime(243)).toBe("4h 3m");
    expect(formatStatisticsRuntime(120)).toBe("2h");
    expect(formatStatisticsRuntime(45)).toBe("45m");
    expect(formatStatisticsRuntime(null)).toBe("\u2014");
    expect(formatStatisticsRuntime(0)).toBe("\u2014");
  });

  it("formats ratings consistently without turning missing ratings into zero", () => {
    expect(formatStatisticsRating(8)).toBe("8/10");
    expect(formatStatisticsRating(8.5)).toBe("8.5/10");
    expect(formatStatisticsRating(null)).toBe("\u2014");
  });
});
