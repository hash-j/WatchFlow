import { describe, expect, it } from "vitest";

import {
  EmptyMovieQueryError,
  MovieSearchValidationError,
} from "./errors";
import { mapTmdbMovieDetails, mapTmdbSearchResponse } from "./tmdb-mapper";
import { validateMovieSearchQuery } from "./validation";

describe("movie search validation", () => {
  it("rejects an empty search query", () => {
    expect(() => validateMovieSearchQuery("   \n  ")).toThrow(
      EmptyMovieQueryError,
    );
  });

  it("normalizes Unicode and whitespace while capping provider input", () => {
    expect(validateMovieSearchQuery("  The   Matrix \n")).toBe("The Matrix");
    expect(() => validateMovieSearchQuery("a".repeat(121))).toThrow(
      MovieSearchValidationError,
    );
  });
});

describe("TMDB response mapping", () => {
  it("maps search payloads into internal movie summaries", () => {
    const result = mapTmdbSearchResponse({
      page: 1,
      results: [
        {
          id: 603,
          adult: false,
          title: "The Matrix",
          original_title: "The Matrix",
          overview: "A hacker discovers the truth.",
          poster_path: "/poster.jpg",
          release_date: "1999-03-30",
          vote_average: 8.2,
          vote_count: 25000,
          popularity: 100,
        },
        {
          id: 999,
          adult: true,
          title: "Excluded",
        },
      ],
      total_pages: 1,
    });

    expect(result).toEqual([
      {
        tmdbId: 603,
        title: "The Matrix",
        originalTitle: null,
        overview: "A hacker discovers the truth.",
        posterPath: "/poster.jpg",
        releaseDate: "1999-03-30",
        voteAverage: 8.2,
      },
    ]);
    expect(result[0]).not.toHaveProperty("popularity");
  });

  it("normalizes missing movie metadata without leaking raw fields", () => {
    const result = mapTmdbMovieDetails({
      id: 42,
      adult: false,
      title: "",
      original_title: "",
      overview: "",
      poster_path: null,
      backdrop_path: null,
      release_date: "",
      vote_average: 0,
      vote_count: 0,
      runtime: null,
      genres: null,
      original_language: null,
      production_countries: null,
      credits: { cast: [], crew: [] },
      videos: { results: [] },
    });

    expect(result).toMatchObject({
      tmdbId: 42,
      title: "Untitled movie",
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
    });
  });

  it("extracts the director, ordered main cast, and best suitable trailer", () => {
    const result = mapTmdbMovieDetails({
      id: 603,
      adult: false,
      title: "The Matrix",
      original_title: "The Matrix",
      vote_average: 8.2,
      vote_count: 25000,
      runtime: 136,
      genres: [{ id: 28, name: "Action" }],
      original_language: "en",
      production_countries: [
        { iso_3166_1: "US", name: "United States of America" },
      ],
      credits: {
        crew: [{ job: "Director", name: "Lana Wachowski" }],
        cast: [
          { name: "Carrie-Anne Moss", character: "Trinity", order: 1 },
          { name: "Keanu Reeves", character: "Neo", order: 0 },
        ],
      },
      videos: {
        results: [
          {
            site: "YouTube",
            type: "Teaser",
            official: false,
            key: "teaser",
            name: "Teaser",
          },
          {
            site: "YouTube",
            type: "Trailer",
            official: true,
            key: "official-trailer",
            name: "Official Trailer",
          },
        ],
      },
    });

    expect(result.director).toBe("Lana Wachowski");
    expect(result.cast.map((member) => member.name)).toEqual([
      "Keanu Reeves",
      "Carrie-Anne Moss",
    ]);
    expect(result.trailer?.key).toBe("official-trailer");
    expect(result.originalLanguage).toBe("en");
    expect(result.productionCountries).toEqual(["United States of America"]);
  });
});
