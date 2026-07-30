import type { LibraryMovieStatus } from "@/lib/movies/types";

import {
  genreComparisonKey,
  normalizeGenreLabel,
  normalizeGenreLabels,
} from "./moods";
import type {
  DirectorInsight,
  DiscoveryMovie,
  GenreInsight,
  GenreInsightSource,
  RecommendationBasis,
  RecommendationItem,
  RecommendationReason,
  RecommendationResult,
  RecommendationScoreBreakdown,
  RecommendationSeed,
  RecommendationSeedSource,
  RecommendationSection,
} from "./types";

export const MAX_RECOMMENDATIONS = 16;
export const MAX_RECOMMENDATION_SEEDS = 5;
export const MAX_RENDERED_SEEDS = 3;
export const MAX_RECOMMENDATIONS_PER_SEED = 3;

export const RECOMMENDATION_CANDIDATE_STATUSES = [
  "want_to_watch",
  "watch_next",
  "scheduled",
  "on_hold",
] as const satisfies readonly LibraryMovieStatus[];

export const RECOMMENDATION_SCORE_WEIGHTS = {
  sharedGenre: 4,
  sharedGenreCap: 12,
  sameDirector: 3,
  similarReleasePeriod: 1,
  similarRuntime: 1,
  favourite: 1,
  watchNext: 1,
  publicRatingSeven: 1,
  publicRatingEight: 2,
  seedRatingNine: 1,
  seedRatingTen: 2,
} as const;

function normalizedText(value: string | null) {
  const normalized = normalizeGenreLabel(value);
  return normalized?.toLocaleLowerCase("en-US") ?? null;
}

function formatList(values: readonly string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function compareMovieIdentity(left: DiscoveryMovie, right: DiscoveryMovie) {
  const title = left.title.localeCompare(right.title, "en", {
    sensitivity: "base",
  });
  return title || left.userMovieId.localeCompare(right.userMovieId);
}

function compareSeedMovies(left: DiscoveryMovie, right: DiscoveryMovie) {
  const rating =
    (right.personalRating ?? Number.NEGATIVE_INFINITY) -
    (left.personalRating ?? Number.NEGATIVE_INFINITY);
  if (rating) return rating;

  if (left.favourite !== right.favourite) {
    return left.favourite ? -1 : 1;
  }
  if (left.status !== right.status) {
    if (left.status === "watched") return -1;
    if (right.status === "watched") return 1;
  }

  return compareMovieIdentity(left, right);
}

function addUniqueSeeds(
  result: RecommendationSeed[],
  seen: Set<string>,
  movies: readonly DiscoveryMovie[],
  source: RecommendationSeedSource,
) {
  for (const movie of [...movies].sort(compareSeedMovies)) {
    if (result.length >= MAX_RECOMMENDATION_SEEDS) {
      return;
    }
    if (!seen.has(movie.userMovieId)) {
      result.push({ movie, source });
      seen.add(movie.userMovieId);
    }
  }
}

export function selectRecommendationSeeds(
  movies: readonly DiscoveryMovie[],
): RecommendationSeed[] {
  const result: RecommendationSeed[] = [];
  const seen = new Set<string>();

  addUniqueSeeds(
    result,
    seen,
    movies.filter(
      (movie) =>
        movie.personalRating !== null && movie.personalRating >= 8,
    ),
    "high_rating",
  );
  addUniqueSeeds(
    result,
    seen,
    movies.filter(
      (movie) => movie.status === "watched" && movie.favourite,
    ),
    "favourite_watched",
  );
  addUniqueSeeds(
    result,
    seen,
    movies.filter(
      (movie) =>
        movie.status === "watched" &&
        movie.personalRating !== null &&
        movie.personalRating >= 7,
    ),
    "rated_watched",
  );

  return result;
}

export function isRecommendationCandidate(movie: DiscoveryMovie) {
  return (RECOMMENDATION_CANDIDATE_STATUSES as readonly string[]).includes(
    movie.status,
  );
}

function sharedGenres(seed: DiscoveryMovie, candidate: DiscoveryMovie) {
  const candidateKeys = new Set(
    normalizeGenreLabels(candidate.genres)
      .map(genreComparisonKey)
      .filter((genre): genre is string => Boolean(genre)),
  );

  return normalizeGenreLabels(seed.genres).filter((genre) =>
    candidateKeys.has(genreComparisonKey(genre)!),
  );
}

export function publicRatingPoints(publicRating: number | null) {
  if (publicRating === null || !Number.isFinite(publicRating)) {
    return 0;
  }
  if (publicRating >= 8) {
    return RECOMMENDATION_SCORE_WEIGHTS.publicRatingEight;
  }
  if (publicRating >= 7) {
    return RECOMMENDATION_SCORE_WEIGHTS.publicRatingSeven;
  }
  return 0;
}

export function seedRatingPoints(personalRating: number | null) {
  if (personalRating === null || !Number.isFinite(personalRating)) {
    return 0;
  }
  if (personalRating >= 10) {
    return RECOMMENDATION_SCORE_WEIGHTS.seedRatingTen;
  }
  if (personalRating >= 9) {
    return RECOMMENDATION_SCORE_WEIGHTS.seedRatingNine;
  }
  return 0;
}

function scoreReasons(
  seed: RecommendationSeed,
  candidate: DiscoveryMovie,
  breakdown: RecommendationScoreBreakdown,
) {
  const reasons: RecommendationReason[] = [];

  if (breakdown.sharedGenres.length > 0) {
    reasons.push({
      kind: "shared_genres",
      text: `Shares ${formatList(breakdown.sharedGenres)} with ${seed.movie.title}.`,
    });
  }
  if (breakdown.sameDirector && candidate.director) {
    reasons.push({
      kind: "same_director",
      text: `Also directed by ${candidate.director}.`,
    });
  }
  if (breakdown.similarReleasePeriod) {
    reasons.push({
      kind: "similar_release_period",
      text: `Released within 10 years of ${seed.movie.title}.`,
    });
  }
  if (breakdown.similarRuntime) {
    reasons.push({
      kind: "similar_runtime",
      text: `Its runtime is within 30 minutes of ${seed.movie.title}.`,
    });
  }
  if (breakdown.favouritePoints > 0) {
    reasons.push({
      kind: "favourite",
      text: "Already marked as a favourite in your library.",
    });
  }
  if (breakdown.watchNextPoints > 0) {
    reasons.push({
      kind: "watch_next",
      text: "Already in your Watch Next queue.",
    });
  }
  if (breakdown.publicRatingPoints > 0 && candidate.publicRating !== null) {
    reasons.push({
      kind: "public_rating",
      text: `Has a public rating of ${candidate.publicRating}/10.`,
    });
  }

  return reasons;
}

export function scoreRecommendation(
  seed: RecommendationSeed,
  candidate: DiscoveryMovie,
): RecommendationItem | null {
  if (
    seed.movie.userMovieId === candidate.userMovieId ||
    seed.movie.movieId === candidate.movieId
  ) {
    return null;
  }

  const commonGenres = sharedGenres(seed.movie, candidate);
  const sharedGenrePoints = Math.min(
    commonGenres.length * RECOMMENDATION_SCORE_WEIGHTS.sharedGenre,
    RECOMMENDATION_SCORE_WEIGHTS.sharedGenreCap,
  );
  const sameDirector =
    normalizedText(seed.movie.director) !== null &&
    normalizedText(seed.movie.director) === normalizedText(candidate.director);
  const similarReleasePeriod =
    seed.movie.releaseYear !== null &&
    candidate.releaseYear !== null &&
    Math.abs(seed.movie.releaseYear - candidate.releaseYear) <= 10;
  const similarRuntime =
    seed.movie.runtimeMinutes !== null &&
    candidate.runtimeMinutes !== null &&
    Math.abs(seed.movie.runtimeMinutes - candidate.runtimeMinutes) <= 30;

  const breakdown: RecommendationScoreBreakdown = {
    sharedGenres: commonGenres,
    sharedGenrePoints,
    sameDirector,
    directorPoints: sameDirector
      ? RECOMMENDATION_SCORE_WEIGHTS.sameDirector
      : 0,
    similarReleasePeriod,
    releasePeriodPoints: similarReleasePeriod
      ? RECOMMENDATION_SCORE_WEIGHTS.similarReleasePeriod
      : 0,
    similarRuntime,
    runtimePoints: similarRuntime
      ? RECOMMENDATION_SCORE_WEIGHTS.similarRuntime
      : 0,
    favouritePoints: candidate.favourite
      ? RECOMMENDATION_SCORE_WEIGHTS.favourite
      : 0,
    watchNextPoints:
      candidate.status === "watch_next"
        ? RECOMMENDATION_SCORE_WEIGHTS.watchNext
        : 0,
    publicRatingPoints: publicRatingPoints(candidate.publicRating),
    seedRatingPoints: seedRatingPoints(seed.movie.personalRating),
    total: 0,
  };
  breakdown.total =
    breakdown.sharedGenrePoints +
    breakdown.directorPoints +
    breakdown.releasePeriodPoints +
    breakdown.runtimePoints +
    breakdown.favouritePoints +
    breakdown.watchNextPoints +
    breakdown.publicRatingPoints +
    breakdown.seedRatingPoints;

  return {
    movie: candidate,
    score: breakdown.total,
    seed,
    reasons: scoreReasons(seed, candidate, breakdown),
    breakdown,
  };
}

export function compareScoredRecommendations(
  left: RecommendationItem,
  right: RecommendationItem,
) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  const leftBreakdown = left.breakdown;
  const rightBreakdown = right.breakdown;
  if (
    leftBreakdown &&
    rightBreakdown &&
    leftBreakdown.sharedGenrePoints !== rightBreakdown.sharedGenrePoints
  ) {
    return (
      rightBreakdown.sharedGenrePoints - leftBreakdown.sharedGenrePoints
    );
  }
  if (
    leftBreakdown &&
    rightBreakdown &&
    leftBreakdown.directorPoints !== rightBreakdown.directorPoints
  ) {
    return rightBreakdown.directorPoints - leftBreakdown.directorPoints;
  }

  const publicRating =
    (right.movie.publicRating ?? Number.NEGATIVE_INFINITY) -
    (left.movie.publicRating ?? Number.NEGATIVE_INFINITY);
  return publicRating || compareMovieIdentity(left.movie, right.movie);
}

type InsightAccumulator = {
  label: string;
  score: number;
  movieIds: Set<string>;
};

function rankGenreInsights(
  accumulators: Map<string, InsightAccumulator>,
  source: GenreInsightSource,
) {
  return [...accumulators.values()]
    .map(
      (value): GenreInsight => ({
        genre: value.label,
        score: value.score,
        movieCount: value.movieIds.size,
        source,
      }),
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.movieCount - left.movieCount ||
        left.genre.localeCompare(right.genre, "en", { sensitivity: "base" }),
    );
}

export function buildRatedGenreInsights(
  movies: readonly DiscoveryMovie[],
) {
  const accumulators = new Map<string, InsightAccumulator>();

  for (const movie of movies) {
    if (movie.personalRating === null || movie.personalRating < 7) {
      continue;
    }

    const genres = normalizeGenreLabels(movie.genres);
    if (genres.length === 0) {
      continue;
    }
    const contribution = (movie.personalRating - 6) / genres.length;

    for (const genre of genres) {
      const key = genreComparisonKey(genre)!;
      const current = accumulators.get(key) ?? {
        label: genre,
        score: 0,
        movieIds: new Set<string>(),
      };
      current.score += contribution;
      current.movieIds.add(movie.userMovieId);
      accumulators.set(key, current);
    }
  }

  return rankGenreInsights(accumulators, "rated");
}

export function buildFrequencyGenreInsights(
  movies: readonly DiscoveryMovie[],
  source: Exclude<GenreInsightSource, "rated">,
) {
  const accumulators = new Map<string, InsightAccumulator>();
  const included = movies.filter((movie) =>
    source === "watched"
      ? movie.status === "watched"
      : movie.favourite,
  );

  for (const movie of included) {
    const genres = normalizeGenreLabels(movie.genres);
    if (genres.length === 0) {
      continue;
    }

    for (const genre of genres) {
      const key = genreComparisonKey(genre)!;
      const current = accumulators.get(key) ?? {
        label: genre,
        score: 0,
        movieIds: new Set<string>(),
      };
      current.score += 1 / genres.length;
      current.movieIds.add(movie.userMovieId);
      accumulators.set(key, current);
    }
  }

  return rankGenreInsights(accumulators, source);
}

export function buildDirectorInsights(
  movies: readonly DiscoveryMovie[],
): DirectorInsight[] {
  const directors = new Map<
    string,
    { label: string; total: number; movieIds: Set<string> }
  >();

  for (const movie of movies) {
    const key = normalizedText(movie.director);
    if (!key || !movie.director || movie.personalRating === null) {
      continue;
    }

    const current = directors.get(key) ?? {
      label: normalizeGenreLabel(movie.director)!,
      total: 0,
      movieIds: new Set<string>(),
    };
    current.total += movie.personalRating;
    current.movieIds.add(movie.userMovieId);
    directors.set(key, current);
  }

  return [...directors.values()]
    .map((director) => ({
      director: director.label,
      averageRating: director.total / director.movieIds.size,
      movieCount: director.movieIds.size,
    }))
    .filter(
      (director) =>
        director.movieCount >= 2 && director.averageRating >= 7,
    )
    .sort(
      (left, right) =>
        right.averageRating - left.averageRating ||
        right.movieCount - left.movieCount ||
        left.director.localeCompare(right.director, "en", {
          sensitivity: "base",
        }),
    );
}

function baseCandidateReasons(movie: DiscoveryMovie) {
  const reasons: RecommendationReason[] = [];
  let score = 0;

  if (movie.favourite) {
    score += RECOMMENDATION_SCORE_WEIGHTS.favourite;
    reasons.push({
      kind: "favourite",
      text: "Already marked as a favourite in your library.",
    });
  }
  if (movie.status === "watch_next") {
    score += RECOMMENDATION_SCORE_WEIGHTS.watchNext;
    reasons.push({
      kind: "watch_next",
      text: "Already in your Watch Next queue.",
    });
  }
  const ratingPoints = publicRatingPoints(movie.publicRating);
  if (ratingPoints > 0 && movie.publicRating !== null) {
    score += ratingPoints;
    reasons.push({
      kind: "public_rating",
      text: `Has a public rating of ${movie.publicRating}/10.`,
    });
  }

  return { reasons, score };
}

function scorePreferenceCandidate(
  movie: DiscoveryMovie,
  genreInsights: readonly GenreInsight[],
  directorInsights: readonly DirectorInsight[],
) {
  const base = baseCandidateReasons(movie);
  const movieGenreKeys = new Set(
    normalizeGenreLabels(movie.genres).map(genreComparisonKey),
  );
  const matchingGenres = genreInsights.filter((insight) =>
    movieGenreKeys.has(genreComparisonKey(insight.genre)),
  );
  const genrePoints = Math.min(
    matchingGenres.length * RECOMMENDATION_SCORE_WEIGHTS.sharedGenre,
    RECOMMENDATION_SCORE_WEIGHTS.sharedGenreCap,
  );
  const director = directorInsights.find(
    (insight) =>
      normalizedText(insight.director) === normalizedText(movie.director),
  );
  const reasons = [...base.reasons];

  if (matchingGenres.length > 0) {
    const source = matchingGenres[0]!.source;
    reasons.unshift({
      kind:
        source === "rated"
          ? "rated_genre"
          : source === "watched"
            ? "watched_genre"
            : "favourite_genre",
      text:
        source === "rated"
          ? `Matches ${formatList(matchingGenres.map((item) => item.genre))}, which you rate highly.`
          : source === "watched"
            ? `Matches ${formatList(matchingGenres.map((item) => item.genre))}, which appears often in your watched movies.`
            : `Matches ${formatList(matchingGenres.map((item) => item.genre))}, which appears often in your favourites.`,
    });
  }
  if (director) {
    reasons.unshift({
      kind: "rated_director",
      text: `You have rated ${director.movieCount} movies by ${director.director} an average of ${director.averageRating.toFixed(1)}/10.`,
    });
  }

  return {
    movie,
    score:
      base.score +
      genrePoints +
      (director ? RECOMMENDATION_SCORE_WEIGHTS.sameDirector : 0),
    seed: null,
    reasons,
    breakdown: null,
  } satisfies RecommendationItem;
}

function primaryGenreKey(item: RecommendationItem) {
  return (
    genreComparisonKey(item.breakdown?.sharedGenres[0]) ??
    genreComparisonKey(normalizeGenreLabels(item.movie.genres)[0]) ??
    "_unknown"
  );
}

function refreshHash(value: string, refreshSeed: number) {
  let hash = 2166136261 ^ refreshSeed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectDiverseRecommendations(
  items: readonly RecommendationItem[],
  limit: number,
  refreshSeed = 0,
) {
  const remaining = [...items].sort(compareScoredRecommendations);
  const selected: RecommendationItem[] = [];
  const genreUse = new Map<string, number>();
  const directorUse = new Map<string, number>();

  while (remaining.length > 0 && selected.length < limit) {
    const topScore = remaining[0]!.score;
    const window = remaining.filter((item) => item.score >= topScore - 2);
    window.sort((left, right) => {
      const leftGenre = primaryGenreKey(left);
      const rightGenre = primaryGenreKey(right);
      const leftDirector = normalizedText(left.movie.director) ?? "_unknown";
      const rightDirector = normalizedText(right.movie.director) ?? "_unknown";
      const leftPenalty =
        (genreUse.get(leftGenre) ?? 0) * 2 +
        (directorUse.get(leftDirector) ?? 0);
      const rightPenalty =
        (genreUse.get(rightGenre) ?? 0) * 2 +
        (directorUse.get(rightDirector) ?? 0);

      if (leftPenalty !== rightPenalty) {
        return leftPenalty - rightPenalty;
      }
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      if (refreshSeed) {
        const hashDifference =
          refreshHash(left.movie.userMovieId, refreshSeed) -
          refreshHash(right.movie.userMovieId, refreshSeed);
        if (hashDifference) return hashDifference;
      }
      return compareScoredRecommendations(left, right);
    });

    const chosen = window[0]!;
    selected.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
    const genre = primaryGenreKey(chosen);
    const director = normalizedText(chosen.movie.director) ?? "_unknown";
    genreUse.set(genre, (genreUse.get(genre) ?? 0) + 1);
    directorUse.set(director, (directorUse.get(director) ?? 0) + 1);
  }

  return selected;
}

function hasSeedSimilarity(item: RecommendationItem) {
  const breakdown = item.breakdown;
  return Boolean(
    breakdown &&
      (breakdown.sharedGenrePoints > 0 ||
        breakdown.sameDirector ||
        breakdown.similarReleasePeriod ||
        breakdown.similarRuntime),
  );
}

function seedSection(seed: RecommendationSeed, items: RecommendationItem[]) {
  const rating = seed.movie.personalRating;
  const title =
    seed.source === "favourite_watched"
      ? `Because ${seed.movie.title} is a watched favourite`
      : `Because you rated ${seed.movie.title} ${rating ?? 7}/10`;

  return {
    id: `because-${seed.movie.userMovieId}`,
    title,
    description:
      "These movies share stored genres, director, release period, or runtime.",
    items,
  } satisfies RecommendationSection;
}

function sectionBasis(sections: readonly RecommendationSection[]) {
  const renderedSeedSources = sections.flatMap((section) =>
    section.items
      .map((item) => item.seed?.source ?? null)
      .filter(
        (source): source is RecommendationSeedSource => source !== null,
      ),
  );

  if (renderedSeedSources.includes("high_rating")) {
    return "high_ratings";
  }
  if (renderedSeedSources.includes("favourite_watched")) {
    return "favourite_watched";
  }
  if (renderedSeedSources.includes("rated_watched")) {
    return "rated_watched";
  }
  if (sections.some((section) => section.id === "rated-genres")) {
    return "rated_genres";
  }
  if (sections.some((section) => section.id === "watched-genres")) {
    return "watched_genres";
  }
  if (sections.some((section) => section.id === "favourite-genres")) {
    return "favourite_genres";
  }
  if (sections.some((section) => section.id === "rated-directors")) {
    return "rated_genres";
  }
  if (sections.some((section) => section.id === "public-rating")) {
    return "public_ratings";
  }
  return "none";
}

function recommendationNotice(
  sections: readonly RecommendationSection[],
  basis: RecommendationBasis,
  hasAnyRating: boolean,
) {
  if (!hasAnyRating) {
    return "You have not rated any movies yet, so these suggestions use watched genres, favourites, Watch Next, and public ratings where available.";
  }

  if (basis === "high_ratings") {
    return null;
  }
  if (basis === "favourite_watched") {
    return "No eligible candidates matched your strongest rated seeds, so these suggestions use watched favourites.";
  }
  if (basis === "rated_watched") {
    return "No eligible candidates matched your 8/10-or-higher seeds, so these suggestions use watched movies rated 7/10 or higher.";
  }
  if (basis === "rated_genres") {
    return "These suggestions use broader genre or director patterns from movies you rated.";
  }
  if (basis === "watched_genres") {
    return "No eligible candidates matched your rated genres, so these suggestions use genres from your watched movies.";
  }
  if (basis === "favourite_genres") {
    return "No eligible candidates matched your rated or watched genres, so these suggestions use genres from your favourites.";
  }
  if (basis === "public_ratings") {
    return "No eligible candidates matched your rating, genre, or director signals, so this fallback uses stored public ratings.";
  }
  if (sections.some((section) => section.id === "watch-next")) {
    return "No eligible candidates matched your rating, genre, director, or public-rating signals, so these suggestions come from your Watch Next queue.";
  }

  return "These suggestions use the available rule-based signals from your private library.";
}

function genreSectionCopy(source: GenreInsightSource) {
  if (source === "rated") {
    return {
      title: "Genres you rate highly",
      description:
        "Each rated movie shares its rating weight across all of its genres.",
    };
  }
  if (source === "watched") {
    return {
      title: "From genres you watch often",
      description:
        "You have not rated enough movies, so this uses your watched genre history.",
    };
  }
  return {
    title: "From genres in your favourites",
    description:
      "This uses genres represented in movies you marked as favourites.",
  };
}

export function buildRuleBasedRecommendations(
  movies: readonly DiscoveryMovie[],
  options: { refreshSeed?: number } = {},
): RecommendationResult {
  const refreshSeed =
    Number.isSafeInteger(options.refreshSeed) && options.refreshSeed! >= 0
      ? options.refreshSeed!
      : 0;
  const allCandidates = movies.filter(isRecommendationCandidate);

  if (movies.length === 0) {
    return {
      sections: [],
      seeds: [],
      genreInsights: [],
      directorInsights: [],
      basis: "none",
      coldStart: "empty_library",
      notice: "Add movies to your library to receive recommendations.",
      libraryCount: 0,
      candidateCount: 0,
      recommendationCount: 0,
    };
  }

  if (allCandidates.length === 0) {
    return {
      sections: [],
      seeds: selectRecommendationSeeds(movies),
      genreInsights: [],
      directorInsights: buildDirectorInsights(movies),
      basis: "none",
      coldStart: "no_eligible_candidates",
      notice:
        "Add some unwatched movies to your library so WatchFlow has something to recommend.",
      libraryCount: movies.length,
      candidateCount: 0,
      recommendationCount: 0,
    };
  }

  const seeds = selectRecommendationSeeds(movies);
  const ratedGenres = buildRatedGenreInsights(movies);
  const watchedGenres = buildFrequencyGenreInsights(movies, "watched");
  const favouriteGenres = buildFrequencyGenreInsights(movies, "favourite");
  const defaultGenreInsights =
    ratedGenres.length > 0
      ? ratedGenres
      : watchedGenres.length > 0
        ? watchedGenres
        : favouriteGenres;
  let genreInsights = defaultGenreInsights;
  const directorInsights = buildDirectorInsights(movies);
  const seedIds = new Set(seeds.map((seed) => seed.movie.userMovieId));
  const candidates = allCandidates.filter(
    (candidate) => !seedIds.has(candidate.userMovieId),
  );
  const sections: RecommendationSection[] = [];
  const used = new Set<string>();
  const available = () =>
    candidates.filter((candidate) => !used.has(candidate.userMovieId));
  const capacity = () => MAX_RECOMMENDATIONS - used.size;
  const take = (items: readonly RecommendationItem[], limit: number) => {
    const selected = selectDiverseRecommendations(
      items,
      Math.min(limit, capacity()),
      refreshSeed,
    );
    selected.forEach((item) => used.add(item.movie.userMovieId));
    return selected;
  };

  for (const seed of seeds.slice(0, MAX_RENDERED_SEEDS)) {
    if (capacity() <= 0) break;
    const ranked = available()
      .map((candidate) => scoreRecommendation(seed, candidate))
      .filter((item): item is RecommendationItem => Boolean(item))
      .filter(hasSeedSimilarity);
    const items = take(ranked, MAX_RECOMMENDATIONS_PER_SEED);
    if (items.length > 0) {
      sections.push(seedSection(seed, items));
    }
  }

  const genreInsightSources = [
    ratedGenres,
    watchedGenres,
    favouriteGenres,
  ].filter((insights) => insights.length > 0);
  for (const insights of genreInsightSources) {
    if (capacity() <= 0) break;

    const topGenres = insights.slice(0, 3);
    const items = take(
      available()
        .map((movie) => scorePreferenceCandidate(movie, topGenres, []))
        .filter((item) =>
          item.reasons.some((reason) =>
            [
              "rated_genre",
              "watched_genre",
              "favourite_genre",
            ].includes(reason.kind),
          ),
        ),
      4,
    );
    if (items.length === 0) {
      continue;
    }

    genreInsights = insights;
    const copy = genreSectionCopy(topGenres[0]!.source);
    sections.push({
      id: `${topGenres[0]!.source}-genres`,
      ...copy,
      items,
    });
    break;
  }

  const topDirectors = directorInsights.slice(0, 3);
  if (topDirectors.length > 0 && capacity() > 0) {
    const items = take(
      available()
        .map((movie) => scorePreferenceCandidate(movie, [], topDirectors))
        .filter((item) =>
          item.reasons.some((reason) => reason.kind === "rated_director"),
        ),
      3,
    );
    if (items.length > 0) {
      sections.push({
        id: "rated-directors",
        title: "From directors you rate highly",
        description:
          "A director appears here only after at least two ratings averaging 7/10 or higher.",
        items,
      });
    }
  }

  if (capacity() > 0) {
    const items = take(
      available()
        .filter((movie) => movie.status === "watch_next")
        .map((movie) => scorePreferenceCandidate(movie, [], [])),
      3,
    );
    if (items.length > 0) {
      sections.push({
        id: "watch-next",
        title: "From your Watch Next queue",
        description:
          "These suggestions are already in your queue; their positions are unchanged.",
        items,
      });
    }
  }

  if (capacity() > 0) {
    const items = take(
      available()
        .filter(
          (movie) =>
            movie.publicRating !== null && movie.publicRating >= 7,
        )
        .map((movie) => scorePreferenceCandidate(movie, [], [])),
      4,
    );
    if (items.length > 0) {
      sections.push({
        id: "public-rating",
        title: "Highly rated in your unwatched library",
        description:
          "This fallback uses stored public ratings, not your personal rating.",
        items,
      });
    }
  }

  const recommendationCount = used.size;
  const hasAnyRating = movies.some(
    (movie) => movie.personalRating !== null,
  );
  const basis: RecommendationBasis =
    recommendationCount > 0
      ? sectionBasis(sections)
      : "none";

  if (recommendationCount === 0) {
    return {
      sections: [],
      seeds,
      genreInsights,
      directorInsights,
      basis: "none",
      coldStart: "no_suitable_recommendations",
      notice:
        "No suitable rule-based recommendations are available from your unwatched library yet.",
      libraryCount: movies.length,
      candidateCount: allCandidates.length,
      recommendationCount: 0,
    };
  }

  return {
    sections,
    seeds,
    genreInsights,
    directorInsights,
    basis,
    coldStart: hasAnyRating ? null : "no_ratings",
    notice: recommendationNotice(sections, basis, hasAnyRating),
    libraryCount: movies.length,
    candidateCount: allCandidates.length,
    recommendationCount,
  };
}
