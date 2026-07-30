import { describe, expect, it } from "vitest";

import {
  mapDiscoveryMovieRow,
  mapDiscoveryMovieRows,
  normalizeDiscoveryGenres,
} from "./mapping";

const validRow = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "private-user-id-that-must-not-be-mapped",
  status: "watch_next",
  favourite: true,
  personal_rating: "8.5",
  movies: {
    id: 42,
    title: "  Inception  ",
    original_title: "Inception",
    poster_path: "/poster.jpg",
    release_year: 2010,
    runtime_minutes: 148,
    genres: [
      " Science   Fiction ",
      { name: "Thriller" },
      "science fiction",
      { name: " " },
      null,
    ],
    director: " Christopher   Nolan ",
    public_rating: "8.4",
  },
};

describe("discovery movie mapping", () => {
  it("maps only the bounded discovery fields and never returns a user ID", () => {
    const mapped = mapDiscoveryMovieRow(validRow);

    expect(mapped).toEqual({
      userMovieId: "11111111-1111-4111-8111-111111111111",
      movieId: "42",
      status: "watch_next",
      favourite: true,
      personalRating: 8.5,
      title: "Inception",
      originalTitle: null,
      posterPath: "/poster.jpg",
      releaseYear: 2010,
      runtimeMinutes: 148,
      genres: ["Science Fiction", "Thriller"],
      director: "Christopher Nolan",
      publicRating: 8.4,
    });
    expect(mapped).not.toHaveProperty("user_id");
    expect(mapped).not.toHaveProperty("userId");
  });

  it("supports array-shaped relationships and safely nulls malformed metadata", () => {
    const mapped = mapDiscoveryMovieRow({
      ...validRow,
      personal_rating: 11,
      movies: [
        {
          ...validRow.movies,
          release_year: "not-a-year",
          runtime_minutes: null,
          genres: { name: "Drama" },
          director: " ",
          public_rating: "unrated",
        },
      ],
    });

    expect(mapped).toMatchObject({
      personalRating: null,
      releaseYear: null,
      runtimeMinutes: null,
      genres: [],
      director: null,
      publicRating: null,
    });
  });

  it("drops rows without a valid relationship UUID, movie identity, or status", () => {
    expect(mapDiscoveryMovieRow({ ...validRow, id: "not-a-uuid" })).toBeNull();
    expect(
      mapDiscoveryMovieRow({
        ...validRow,
        status: "private_other_user_status",
      }),
    ).toBeNull();
    expect(
      mapDiscoveryMovieRow({
        ...validRow,
        movies: { ...validRow.movies, id: null },
      }),
    ).toBeNull();
    expect(mapDiscoveryMovieRow(null)).toBeNull();
  });

  it("filters malformed rows without failing the complete dataset", () => {
    expect(mapDiscoveryMovieRows([validRow, null, { id: "invalid" }])).toHaveLength(
      1,
    );
    expect(mapDiscoveryMovieRows({ rows: [validRow] })).toEqual([]);
  });
});

describe("genre normalization", () => {
  it("normalizes, deduplicates, and sorts strings and object names", () => {
    expect(
      normalizeDiscoveryGenres([
        " thriller ",
        { name: "Science   Fiction" },
        "Thriller",
        { name: "" },
        42,
      ]),
    ).toEqual(["Science Fiction", "thriller"]);
  });

  it("returns an empty list for missing or malformed genre JSON", () => {
    expect(normalizeDiscoveryGenres(null)).toEqual([]);
    expect(normalizeDiscoveryGenres({ name: "Drama" })).toEqual([]);
  });
});
