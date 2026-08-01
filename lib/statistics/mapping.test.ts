import { describe, expect, it } from "vitest";

import {
  mapStatisticsMovieRow,
  mapStatisticsMovieRows,
  normalizeStatisticsGenres,
  normalizeStatisticsWatchedDate,
} from "./mapping";

const validRow = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "private-owner-id-must-not-be-mapped",
  status: "watched",
  favourite: true,
  personal_rating: "8.5",
  watched_at: "2026-08-01T00:00:00.000Z",
  scheduled_for: null,
  created_at: "2020-01-01T00:00:00.000Z",
  movies: {
    id: 42,
    title: "  Inception  ",
    poster_path: " /poster.jpg ",
    release_year: "2010",
    runtime_minutes: "148",
    genres: [
      " Science   Fiction ",
      { name: "Thriller" },
      "science fiction",
      { name: " " },
      null,
    ],
  },
};

describe("statistics database row mapping", () => {
  it("maps only required private relationship and movie metadata defensively", () => {
    const mapped = mapStatisticsMovieRow(validRow);

    expect(mapped).toEqual({
      userMovieId: "11111111-1111-4111-8111-111111111111",
      movieId: "42",
      status: "watched",
      favourite: true,
      personalRating: 8.5,
      watchedDate: "2026-08-01",
      scheduledFor: null,
      title: "Inception",
      posterPath: "/poster.jpg",
      releaseYear: 2010,
      runtimeMinutes: 148,
      genres: ["Science Fiction", "Thriller"],
    });
    expect(mapped).not.toHaveProperty("user_id");
    expect(mapped).not.toHaveProperty("userId");
    expect(mapped).not.toHaveProperty("created_at");
  });

  it("supports the array relationship shape returned by some Supabase clients", () => {
    expect(
      mapStatisticsMovieRow({
        ...validRow,
        movies: [validRow.movies],
      }),
    ).toMatchObject({ movieId: "42", title: "Inception" });
  });

  it("preserves valid personal-rating boundaries and nulls invalid or missing ratings", () => {
    expect(
      mapStatisticsMovieRow({ ...validRow, personal_rating: 0 })?.personalRating,
    ).toBe(0);
    expect(
      mapStatisticsMovieRow({ ...validRow, personal_rating: 10 })?.personalRating,
    ).toBe(10);

    for (const personalRating of [null, "", -0.1, 10.1, Number.NaN, Infinity]) {
      expect(
        mapStatisticsMovieRow({ ...validRow, personal_rating: personalRating })
          ?.personalRating,
        String(personalRating),
      ).toBeNull();
    }
  });

  it("accepts only positive whole runtime metadata and never maps invalid runtime as zero", () => {
    for (const runtime of [null, "", 0, -1, 90.5, "not-a-runtime", Infinity]) {
      expect(
        mapStatisticsMovieRow({
          ...validRow,
          movies: { ...validRow.movies, runtime_minutes: runtime },
        })?.runtimeMinutes,
        String(runtime),
      ).toBeNull();
    }

    expect(
      mapStatisticsMovieRow({
        ...validRow,
        movies: { ...validRow.movies, runtime_minutes: "95" },
      })?.runtimeMinutes,
    ).toBe(95);
  });

  it("maps unsupported database statuses to an explicit unknown bucket", () => {
    expect(
      mapStatisticsMovieRow({ ...validRow, status: "private_new_status" })?.status,
    ).toBe("unknown");
    expect(mapStatisticsMovieRow({ ...validRow, status: null })?.status).toBe(
      "unknown",
    );
  });

  it("validates scheduled instants independently from scheduled status", () => {
    expect(
      mapStatisticsMovieRow({
        ...validRow,
        status: "scheduled",
        scheduled_for: "2026-08-10T18:00:00.000Z",
      })?.scheduledFor,
    ).toBe("2026-08-10T18:00:00.000Z");
    expect(
      mapStatisticsMovieRow({
        ...validRow,
        status: "scheduled",
        scheduled_for: "not-an-instant",
      })?.scheduledFor,
    ).toBeNull();
  });

  it("does not infer a watched date from created_at or another timestamp", () => {
    expect(
      mapStatisticsMovieRow({ ...validRow, watched_at: null })?.watchedDate,
    ).toBeNull();
    expect(
      mapStatisticsMovieRow({ ...validRow, watched_at: "not-a-date" })
        ?.watchedDate,
    ).toBeNull();
  });

  it("drops rows without a valid personal relationship or joined movie identity", () => {
    expect(mapStatisticsMovieRow({ ...validRow, id: "not-a-uuid" })).toBeNull();
    expect(mapStatisticsMovieRow({ ...validRow, movies: null })).toBeNull();
    expect(
      mapStatisticsMovieRow({
        ...validRow,
        movies: { ...validRow.movies, id: 0 },
      }),
    ).toBeNull();
    expect(mapStatisticsMovieRow(null)).toBeNull();
  });

  it("filters malformed rows without failing the complete result", () => {
    expect(mapStatisticsMovieRows([validRow, null, { id: "invalid" }])).toHaveLength(
      1,
    );
    expect(mapStatisticsMovieRows({ rows: [validRow] })).toEqual([]);
  });
});

describe("statistics genre parsing", () => {
  it("parses strings and structured names, normalizes whitespace, and deduplicates case-insensitively", () => {
    expect(
      normalizeStatisticsGenres([
        " thriller ",
        { name: "Science   Fiction" },
        "Thriller",
        "science fiction",
        { name: "Drama" },
        { name: "" },
        42,
      ]),
    ).toEqual(["Drama", "Science Fiction", "thriller"]);
  });

  it("returns an empty genre list for missing or malformed JSON", () => {
    expect(normalizeStatisticsGenres(null)).toEqual([]);
    expect(normalizeStatisticsGenres({ name: "Drama" })).toEqual([]);
    expect(normalizeStatisticsGenres([null, 42, {}, " "])).toEqual([]);
  });
});

describe("watched calendar-date normalization", () => {
  it("preserves a valid stored calendar prefix without timezone shifting", () => {
    expect(normalizeStatisticsWatchedDate("2026-01-01T00:00:00.000Z")).toBe(
      "2026-01-01",
    );
    expect(normalizeStatisticsWatchedDate("2026-02-28")).toBe("2026-02-28");
  });

  it("rejects missing, impossible, and malformed watched dates", () => {
    for (const value of [
      null,
      "",
      "2026-02-30T00:00:00.000Z",
      "08/01/2026",
      "not-a-date",
    ]) {
      expect(normalizeStatisticsWatchedDate(value), String(value)).toBeNull();
    }
  });
});
