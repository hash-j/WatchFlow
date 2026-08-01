import { describe, expect, it } from "vitest";

import type { MovieDetails } from "../movies/types";
import { toSharedMovieRow } from "./mapping";

describe("shared movie database mapping", () => {
  it("uses only columns from the deployed movies table", () => {
    const movie: MovieDetails = {
      tmdbId: 27205,
      title: "Inception",
      originalTitle: null,
      overview: "A thief enters dreams.",
      posterPath: "/poster.jpg",
      backdropPath: "/backdrop.jpg",
      releaseDate: "2010-07-15",
      voteAverage: 8.4,
      runtimeMinutes: 148,
      genres: ["Action", "Science Fiction"],
      director: "Christopher Nolan",
      cast: [{ name: "Leonardo DiCaprio", character: "Cobb" }],
      originalLanguage: "en",
      productionCountries: ["United Kingdom", "United States of America"],
      trailer: { key: "trailer-key", name: "Official Trailer", site: "YouTube" },
    };

    const row = toSharedMovieRow(movie);

    expect(Object.keys(row).sort()).toEqual(
      [
        "backdrop_path",
        "director",
        "genres",
        "main_cast",
        "metadata_language",
        "metadata_updated_at",
        "original_language",
        "original_title",
        "overview",
        "poster_path",
        "production_countries",
        "public_rating",
        "release_date",
        "release_year",
        "runtime_minutes",
        "title",
        "tmdb_adult",
        "tmdb_id",
        "trailer_key",
      ].sort(),
    );
    expect(row).toMatchObject({
      tmdb_id: 27205,
      release_year: 2010,
      runtime_minutes: 148,
      main_cast: movie.cast,
      original_language: "en",
      production_countries: movie.productionCountries,
      public_rating: 8.4,
    });
    expect(row.metadata_updated_at).toEqual(expect.any(String));
  });
});
