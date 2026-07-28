import { describe, expect, it } from "vitest";

import { mapLibraryFacets, mapLibraryQueryRow } from "./query-mapping";

const validRow = {
  user_movie_id: "11111111-1111-4111-8111-111111111111",
  movie_id: 42,
  status: "watched",
  favourite: true,
  personal_rating: "8.5",
  priority: 4,
  watched_at: "2026-07-01T00:00:00.000Z",
  added_at: "2026-06-01T00:00:00.000Z",
  tmdb_id: 27205,
  title: "Inception",
  original_title: null,
  poster_path: null,
  release_date: "2010-07-16",
  release_year: 2010,
  public_rating: "8.4",
};

describe("lean library query mapping", () => {
  it("maps favourite and personal/movie fields defensively", () => {
    expect(mapLibraryQueryRow(validRow)).toMatchObject({
      libraryId: validRow.user_movie_id,
      favourite: true,
      personalRating: 8.5,
      movie: {
        id: "42",
        tmdbId: 27205,
        title: "Inception",
        releaseYear: 2010,
        voteAverage: 8.4,
      },
    });
  });

  it("defaults a missing favourite to false", () => {
    expect(
      mapLibraryQueryRow({ ...validRow, favourite: undefined })?.favourite,
    ).toBe(false);
  });

  it("rejects rows without a valid personal or shared movie identifier", () => {
    expect(mapLibraryQueryRow({ ...validRow, user_movie_id: null })).toBeNull();
    expect(mapLibraryQueryRow({ ...validRow, tmdb_id: -1 })).toBeNull();
  });
});

describe("private library facet mapping", () => {
  it("normalizes, case-deduplicates, and sorts owner-provided labels", () => {
    expect(
      mapLibraryFacets({
        genres: [" Drama ", "drama", "Science   Fiction", ""],
        directors: ["Zed", " alpha ", "Alpha"],
        years: [1999, "2024", 1999, null],
        counts: { all: 4, watched: 1, unwatched: 3, favourites: 2 },
      }),
    ).toEqual({
      genres: ["drama", "Science Fiction"],
      directors: ["Alpha", "Zed"],
      years: [2024, 1999],
      counts: { all: 4, watched: 1, unwatched: 3, favourites: 2 },
    });
  });

  it("uses safe empty defaults for malformed data", () => {
    expect(mapLibraryFacets(null)).toEqual({
      genres: [],
      directors: [],
      years: [],
      counts: { all: 0, watched: 0, unwatched: 0, favourites: 0 },
    });
  });
});

