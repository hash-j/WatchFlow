import { describe, expect, it } from "vitest";

import type { LibraryMovieStatus } from "@/lib/movies/types";

import {
  MAX_RECOMMENDATIONS,
  RECOMMENDATION_CANDIDATE_STATUSES,
  RECOMMENDATION_SCORE_WEIGHTS,
  buildDirectorInsights,
  buildFrequencyGenreInsights,
  buildRatedGenreInsights,
  buildRuleBasedRecommendations,
  compareScoredRecommendations,
  isRecommendationCandidate,
  publicRatingPoints,
  scoreRecommendation,
  seedRatingPoints,
  selectDiverseRecommendations,
  selectRecommendationSeeds,
} from "./recommendations";
import type {
  DiscoveryMovie,
  RecommendationItem,
  RecommendationSeed,
} from "./types";

let sequence = 1;

function uuid(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function movie(
  overrides: Partial<DiscoveryMovie> = {},
): DiscoveryMovie {
  const index = sequence++;
  return {
    userMovieId: uuid(index),
    movieId: String(index),
    status: "want_to_watch",
    favourite: false,
    personalRating: null,
    title: `Movie ${String(index).padStart(2, "0")}`,
    originalTitle: null,
    posterPath: null,
    releaseYear: 2015,
    runtimeMinutes: 120,
    genres: ["Drama"],
    director: "Director One",
    publicRating: 7.5,
    ...overrides,
  };
}

function seed(
  seedMovie: DiscoveryMovie,
  source: RecommendationSeed["source"] = "high_rating",
): RecommendationSeed {
  return { movie: seedMovie, source };
}

describe("recommendation seed and candidate rules", () => {
  it.each(RECOMMENDATION_CANDIDATE_STATUSES)(
    "includes candidate status %s",
    (status) => {
      expect(isRecommendationCandidate(movie({ status }))).toBe(true);
    },
  );

  it.each([
    "currently_watching",
    "watched",
    "dropped",
  ] as LibraryMovieStatus[])("excludes candidate status %s", (status) => {
    expect(isRecommendationCandidate(movie({ status }))).toBe(false);
  });

  it("prefers 8+ ratings and sorts stronger seeds first", () => {
    const ratingEight = movie({ personalRating: 8, title: "Eight" });
    const ratingTen = movie({ personalRating: 10, title: "Ten" });
    const result = selectRecommendationSeeds([ratingEight, ratingTen]);

    expect(result.map((item) => item.movie.title)).toEqual(["Ten", "Eight"]);
    expect(result.every((item) => item.source === "high_rating")).toBe(true);
  });

  it("progressively fills seed slots from watched favourites then watched 7+ ratings", () => {
    const primary = movie({ personalRating: 9, title: "Primary" });
    const favourite = movie({
      status: "watched",
      favourite: true,
      title: "Favourite",
    });
    const ratedSeven = movie({
      status: "watched",
      personalRating: 7,
      title: "Seven",
    });

    expect(
      selectRecommendationSeeds([ratedSeven, favourite, primary]).map(
        (item) => item.source,
      ),
    ).toEqual(["high_rating", "favourite_watched", "rated_watched"]);
  });

  it("deduplicates fallback seeds and caps the strongest set at five", () => {
    const seeds = Array.from({ length: 8 }, (_, index) =>
      movie({
        status: "watched",
        favourite: true,
        personalRating: 10 - index / 10,
      }),
    );
    const result = selectRecommendationSeeds(seeds);
    expect(result).toHaveLength(5);
    expect(new Set(result.map((item) => item.movie.userMovieId))).toHaveLength(5);
  });
});

describe("transparent recommendation scoring", () => {
  it("applies every documented weight and caps shared genres at 12", () => {
    const source = seed(
      movie({
        status: "watched",
        personalRating: 10,
        genres: ["Action", "Drama", "Science Fiction", "Thriller"],
        director: "Christopher Nolan",
        releaseYear: 2010,
        runtimeMinutes: 148,
      }),
    );
    const candidate = movie({
      status: "watch_next",
      favourite: true,
      genres: ["Action", "Drama", "Science Fiction", "Thriller"],
      director: "  christopher   nolan ",
      releaseYear: 2020,
      runtimeMinutes: 178,
      publicRating: 8,
    });

    const result = scoreRecommendation(source, candidate)!;
    expect(result.breakdown).toMatchObject({
      sharedGenrePoints: 12,
      directorPoints: 3,
      releasePeriodPoints: 1,
      runtimePoints: 1,
      favouritePoints: 1,
      watchNextPoints: 1,
      publicRatingPoints: 2,
      seedRatingPoints: 2,
      total: 23,
    });
    expect(RECOMMENDATION_SCORE_WEIGHTS.sharedGenreCap).toBe(12);
  });

  it("uses inclusive 10-year and 30-minute similarity boundaries", () => {
    const source = seed(
      movie({
        personalRating: 8,
        genres: [],
        director: null,
        releaseYear: 2000,
        runtimeMinutes: 90,
        publicRating: null,
      }),
    );
    const boundary = scoreRecommendation(
      source,
      movie({
        genres: [],
        director: null,
        releaseYear: 2010,
        runtimeMinutes: 120,
        publicRating: null,
      }),
    )!;
    expect(boundary.breakdown?.releasePeriodPoints).toBe(1);
    expect(boundary.breakdown?.runtimePoints).toBe(1);

    const outside = scoreRecommendation(
      source,
      movie({
        genres: [],
        director: null,
        releaseYear: 2011,
        runtimeMinutes: 121,
        publicRating: null,
      }),
    )!;
    expect(outside.breakdown?.releasePeriodPoints).toBe(0);
    expect(outside.breakdown?.runtimePoints).toBe(0);
  });

  it("adds no metadata-quality penalty when values are missing", () => {
    const result = scoreRecommendation(
      seed(
        movie({
          personalRating: 8,
          genres: [],
          director: null,
          releaseYear: null,
          runtimeMinutes: null,
        }),
      ),
      movie({
        genres: [],
        director: null,
        releaseYear: null,
        runtimeMinutes: null,
        publicRating: null,
      }),
    )!;
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("never scores the seed movie itself", () => {
    const sourceMovie = movie({ personalRating: 9 });
    expect(scoreRecommendation(seed(sourceMovie), sourceMovie)).toBeNull();
    expect(
      scoreRecommendation(
        seed(sourceMovie),
        movie({ movieId: sourceMovie.movieId }),
      ),
    ).toBeNull();
  });

  it("uses transparent public-rating and seed-rating buckets", () => {
    expect([null, 6.9, 7, 7.9, 8, 9].map(publicRatingPoints)).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
    expect([null, 8.9, 9, 9.9, 10].map(seedRatingPoints)).toEqual([
      0, 0, 1, 1, 2,
    ]);
  });

  it("generates concrete reasons for every contributing signal", () => {
    const result = scoreRecommendation(
      seed(
        movie({
          title: "Prisoners",
          status: "watched",
          personalRating: 9,
          genres: ["Mystery", "Thriller"],
          director: "Denis Villeneuve",
        }),
      ),
      movie({
        status: "watch_next",
        favourite: true,
        genres: ["Mystery", "Thriller"],
        director: "Denis Villeneuve",
        publicRating: 8.2,
      }),
    )!;
    const reasonText = result.reasons.map((reason) => reason.text).join(" ");
    expect(reasonText).toContain("Prisoners");
    expect(reasonText).toContain("Denis Villeneuve");
    expect(reasonText).toMatch(/Watch Next/);
    expect(reasonText).toMatch(/public rating/i);
    expect(reasonText).not.toMatch(/\bAI\b/);
  });

  it("uses a stable title and relationship-ID tie-breaker", () => {
    const source = seed(movie({ personalRating: 8 }));
    const alpha = scoreRecommendation(
      source,
      movie({
        title: "Alpha",
        genres: ["Drama"],
        publicRating: 7,
      }),
    )!;
    const beta = scoreRecommendation(
      source,
      movie({
        title: "Beta",
        genres: ["Drama"],
        publicRating: 7,
      }),
    )!;
    expect([beta, alpha].sort(compareScoredRecommendations)[0]?.movie.title).toBe(
      "Alpha",
    );
  });
});

describe("genre and director insights", () => {
  it("weights ratings across all genres instead of counting a multi-genre rating repeatedly", () => {
    const insights = buildRatedGenreInsights([
      movie({ personalRating: 10, genres: ["Drama", "Thriller"] }),
      movie({ personalRating: 8, genres: ["Drama"] }),
      movie({ personalRating: 6.5, genres: ["Comedy"] }),
    ]);
    expect(insights).toEqual([
      { genre: "Drama", score: 4, movieCount: 2, source: "rated" },
      { genre: "Thriller", score: 2, movieCount: 1, source: "rated" },
    ]);
  });

  it("builds watched and favourite genre fallbacks with divided movie weight", () => {
    const watched = buildFrequencyGenreInsights(
      [
        movie({ status: "watched", genres: ["Drama", "Thriller"] }),
        movie({ status: "want_to_watch", genres: ["Comedy"] }),
      ],
      "watched",
    );
    expect(watched.map((item) => item.score)).toEqual([0.5, 0.5]);

    const favourites = buildFrequencyGenreInsights(
      [movie({ favourite: true, genres: ["Comedy"] })],
      "favourite",
    );
    expect(favourites[0]).toMatchObject({
      genre: "Comedy",
      score: 1,
      source: "favourite",
    });
  });

  it("requires two ratings averaging at least 7 before naming a director pattern", () => {
    const insights = buildDirectorInsights([
      movie({ director: "Director A", personalRating: 9 }),
      movie({ director: " director   a ", personalRating: 7 }),
      movie({ director: "Director B", personalRating: 10 }),
      movie({ director: "Director C", personalRating: 5 }),
      movie({ director: "Director C", personalRating: 6 }),
    ]);
    expect(insights).toEqual([
      { director: "Director A", averageRating: 8, movieCount: 2 },
    ]);
  });
});

describe("deduplication, diversity, and cold starts", () => {
  function scored(
    title: string,
    score: number,
    genres: string[],
    director: string,
  ): RecommendationItem {
    return {
      movie: movie({ title, genres, director, publicRating: 7 }),
      score,
      seed: null,
      reasons: [{ kind: "public_rating", text: "Public rating." }],
      breakdown: null,
    };
  }

  it("uses soft genre and director diversity within a two-point quality window", () => {
    const selected = selectDiverseRecommendations(
      [
        scored("Action A", 10, ["Action"], "Director A"),
        scored("Action B", 10, ["Action"], "Director A"),
        scored("Comedy", 9, ["Comedy"], "Director B"),
      ],
      2,
    );
    expect(selected.map((item) => item.movie.title)).toEqual([
      "Action A",
      "Comedy",
    ]);
  });

  it("never promotes an item more than two score points below the current best", () => {
    const selected = selectDiverseRecommendations(
      [
        scored("Action A", 10, ["Action"], "Director A"),
        scored("Action B", 10, ["Action"], "Director A"),
        scored("Comedy", 7, ["Comedy"], "Director B"),
      ],
      2,
    );
    expect(selected.map((item) => item.movie.title)).toEqual([
      "Action A",
      "Action B",
    ]);
  });

  it("returns an empty-library cold start", () => {
    expect(buildRuleBasedRecommendations([])).toMatchObject({
      coldStart: "empty_library",
      basis: "none",
      libraryCount: 0,
      recommendationCount: 0,
    });
  });

  it("returns a no-candidate cold start when every movie is watched, current, or dropped", () => {
    const result = buildRuleBasedRecommendations([
      movie({ status: "watched", personalRating: 9 }),
      movie({ status: "currently_watching" }),
      movie({ status: "dropped" }),
    ]);
    expect(result).toMatchObject({
      coldStart: "no_eligible_candidates",
      candidateCount: 0,
      recommendationCount: 0,
    });
  });

  it("uses public ratings honestly when no ratings or history exist", () => {
    const result = buildRuleBasedRecommendations([
      movie({
        status: "want_to_watch",
        personalRating: null,
        publicRating: 8.4,
      }),
    ]);
    expect(result.coldStart).toBe("no_ratings");
    expect(result.sections.map((section) => section.id)).toContain(
      "public-rating",
    );
    expect(result.notice).toMatch(/not rated/i);
  });

  it("falls through rated genres to watched genres when only the watched signal has an eligible match", () => {
    const ratedDrama = movie({
      status: "watched",
      personalRating: 9,
      genres: ["Drama"],
      director: "Rated Director",
      releaseYear: 1990,
      runtimeMinutes: 90,
    });
    const watchedAction = movie({
      status: "watched",
      personalRating: null,
      genres: ["Action"],
      director: "Watched Director",
      releaseYear: 2000,
      runtimeMinutes: 100,
    });
    const actionCandidate = movie({
      status: "want_to_watch",
      genres: ["Action"],
      director: "Different Director",
      releaseYear: 2025,
      runtimeMinutes: 180,
      publicRating: null,
    });

    const result = buildRuleBasedRecommendations([
      ratedDrama,
      watchedAction,
      actionCandidate,
    ]);

    expect(result.sections.map((section) => section.id)).toEqual([
      "watched-genres",
    ]);
    expect(result.genreInsights[0]?.source).toBe("watched");
    expect(result.basis).toBe("watched_genres");
    expect(result.notice).toMatch(/rated genres/i);
    expect(
      result.sections.filter((section) => section.id.endsWith("-genres")),
    ).toHaveLength(1);
  });

  it("derives a public-rating fallback basis from emitted sections rather than an unrelated high-rated seed", () => {
    const unrelatedSeed = movie({
      status: "watched",
      personalRating: 10,
      genres: ["Drama"],
      director: "Seed Director",
      releaseYear: 1990,
      runtimeMinutes: 90,
    });
    const publicCandidate = movie({
      status: "want_to_watch",
      genres: ["Comedy"],
      director: "Candidate Director",
      releaseYear: 2025,
      runtimeMinutes: 180,
      publicRating: 8.5,
    });

    const result = buildRuleBasedRecommendations([
      unrelatedSeed,
      publicCandidate,
    ]);

    expect(result.sections.map((section) => section.id)).toEqual([
      "public-rating",
    ]);
    expect(result.basis).toBe("public_ratings");
    expect(result.notice).toMatch(/stored public ratings/i);
    expect(result.notice).not.toMatch(/not rated enough/i);
  });

  it("does not label Watch-Next-only output as high-rating based", () => {
    const unrelatedSeed = movie({
      status: "watched",
      personalRating: 9,
      genres: ["Drama"],
      director: "Seed Director",
      releaseYear: 1990,
      runtimeMinutes: 90,
    });
    const queuedCandidate = movie({
      status: "watch_next",
      genres: ["Comedy"],
      director: "Candidate Director",
      releaseYear: 2025,
      runtimeMinutes: 180,
      publicRating: null,
    });

    const result = buildRuleBasedRecommendations([
      unrelatedSeed,
      queuedCandidate,
    ]);

    expect(result.sections.map((section) => section.id)).toEqual([
      "watch-next",
    ]);
    expect(result.basis).toBe("none");
    expect(result.notice).toMatch(/Watch Next queue/i);
    expect(result.notice).not.toMatch(/not rated enough/i);
  });

  it("describes a watched-favourite seed as a favourite even when it has a low rating", () => {
    const favourite = movie({
      status: "watched",
      favourite: true,
      personalRating: 5,
      title: "Comfort Movie",
      genres: ["Drama"],
    });
    const candidate = movie({
      genres: ["Drama"],
      publicRating: 8,
    });
    const result = buildRuleBasedRecommendations([favourite, candidate]);
    expect(result.sections[0]?.title).toBe(
      "Because Comfort Movie is a watched favourite",
    );
    expect(result.sections[0]?.title).not.toContain("5/10");
  });

  it("does not invent a recommendation when no rule supplies a reason", () => {
    const result = buildRuleBasedRecommendations([
      movie({
        status: "want_to_watch",
        genres: [],
        director: null,
        publicRating: null,
      }),
    ]);
    expect(result).toMatchObject({
      coldStart: "no_suitable_recommendations",
      recommendationCount: 0,
    });
  });

  it("excludes all seeds and ineligible statuses, deduplicates sections, and caps output", () => {
    const source = movie({
      status: "watched",
      title: "Prisoners",
      personalRating: 9,
      genres: ["Thriller"],
      director: "Denis Villeneuve",
    });
    const candidates = Array.from({ length: 25 }, (_, index) =>
      movie({
        status: index === 23 ? "watched" : index === 24 ? "dropped" : "want_to_watch",
        title: `Thriller ${String(index).padStart(2, "0")}`,
        genres: ["Thriller"],
        director: index % 2 ? "Other Director" : "Denis Villeneuve",
        publicRating: 7 + (index % 3) / 2,
      }),
    );
    const result = buildRuleBasedRecommendations([source, ...candidates]);
    const ids = result.sections.flatMap((section) =>
      section.items.map((item) => item.movie.userMovieId),
    );

    expect(result.recommendationCount).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(source.userMovieId);
    expect(
      result.sections
        .flatMap((section) => section.items)
        .every((item) => isRecommendationCandidate(item.movie)),
    ).toBe(true);
  });

  it("assigns a candidate only once when it matches multiple seeds", () => {
    const firstSeed = movie({
      status: "watched",
      personalRating: 10,
      genres: ["Mystery", "Thriller"],
      title: "First Seed",
    });
    const secondSeed = movie({
      status: "watched",
      personalRating: 9,
      genres: ["Mystery", "Thriller"],
      title: "Second Seed",
    });
    const candidate = movie({
      genres: ["Mystery", "Thriller"],
      publicRating: 8,
      title: "Shared Candidate",
    });
    const result = buildRuleBasedRecommendations([
      firstSeed,
      secondSeed,
      candidate,
    ]);
    const occurrences = result.sections
      .flatMap((section) => section.items)
      .filter((item) => item.movie.userMovieId === candidate.userMovieId);
    expect(occurrences).toHaveLength(1);
  });

  it("keeps refresh deterministic for the same seed and does not change score priority", () => {
    const source = movie({
      status: "watched",
      personalRating: 9,
      genres: ["Drama"],
    });
    const candidates = Array.from({ length: 8 }, (_, index) =>
      movie({
        title: `Candidate ${index}`,
        genres: ["Drama"],
        publicRating: 8,
      }),
    );
    const first = buildRuleBasedRecommendations(
      [source, ...candidates],
      { refreshSeed: 42 },
    );
    const second = buildRuleBasedRecommendations(
      [source, ...candidates],
      { refreshSeed: 42 },
    );
    expect(
      first.sections.flatMap((section) =>
        section.items.map((item) => item.movie.userMovieId),
      ),
    ).toEqual(
      second.sections.flatMap((section) =>
        section.items.map((item) => item.movie.userMovieId),
      ),
    );
  });
});
