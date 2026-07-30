import {
  MOOD_RULES,
  genreComparisonKey,
  isMoodKey,
  matchesMood,
  normalizeGenreLabel,
  normalizeGenreLabels,
} from "./moods";
import {
  PICKER_RELEASE_PERIODS,
  PICKER_RUNTIME_OPTIONS,
  PICKER_WATCHED_STATES,
  type DiscoveryMovie,
  type ParsedPickerFilters,
  type PickerFilters,
  type PickerReleasePeriod,
  type PickerResult,
  type PickerResultMovie,
  type RawPickerSearchParams,
} from "./types";

export const MAX_PICKER_GENRE_LENGTH = 100;
export const MAX_PICKER_EXCLUSIONS = 50;

export const DEFAULT_PICKER_FILTERS: PickerFilters = {
  genre: null,
  maxRuntime: null,
  minPublicRating: null,
  mood: "any",
  releasePeriod: "any",
  watchedState: "unwatched",
  watchNextOnly: false,
  favouriteOnly: false,
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PickerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PickerInputError";
  }
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseToggle(
  value: string | string[] | undefined,
  label: string,
  warnings: string[],
) {
  const candidate = first(value);
  if (candidate === undefined) {
    return false;
  }

  if (candidate === "1" || candidate === "true" || candidate === "on") {
    return true;
  }

  if (candidate === "0" || candidate === "false" || candidate === "off") {
    return false;
  }

  warnings.push(`${label} was ignored because it was invalid.`);
  return false;
}

function parseRuntime(
  value: string | string[] | undefined,
  warnings: string[],
) {
  const candidate = first(value);
  if (!candidate) {
    return null;
  }

  const parsed = Number(candidate);
  if (
    Number.isSafeInteger(parsed) &&
    (PICKER_RUNTIME_OPTIONS as readonly number[]).includes(parsed)
  ) {
    return parsed as Exclude<PickerFilters["maxRuntime"], null>;
  }

  warnings.push("The maximum runtime was ignored because it was invalid.");
  return null;
}

function parseMinimumPublicRating(
  value: string | string[] | undefined,
  warnings: string[],
) {
  const candidate = first(value)?.trim();
  if (!candidate) {
    return null;
  }

  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(candidate)) {
    warnings.push(
      "The minimum public rating was ignored because it was invalid.",
    );
    return null;
  }

  const parsed = Number(candidate);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 10) {
    return parsed;
  }

  warnings.push(
    "The minimum public rating was ignored because it was invalid.",
  );
  return null;
}

function parseGenre(
  value: string | string[] | undefined,
  availableGenres: readonly string[] | undefined,
  warnings: string[],
) {
  const rawGenre = first(value);
  if (rawGenre === undefined || !rawGenre.trim()) {
    return null;
  }

  const normalized = normalizeGenreLabel(rawGenre);
  if (!normalized || normalized.length > MAX_PICKER_GENRE_LENGTH) {
    warnings.push("The genre was ignored because it was invalid.");
    return null;
  }

  if (availableGenres === undefined) {
    return normalized;
  }

  const requestedKey = genreComparisonKey(normalized);
  const canonical = availableGenres.find(
    (genre) => genreComparisonKey(genre) === requestedKey,
  );
  if (!canonical) {
    warnings.push(
      "The genre was ignored because it is not represented in your library.",
    );
    return null;
  }

  return canonical;
}

export function parsePickerSearchParams(
  raw: RawPickerSearchParams,
  availableGenres?: readonly string[],
): ParsedPickerFilters {
  const warnings: string[] = [];
  const rawMood = first(raw.mood);
  const rawPeriod = first(raw.period);
  const rawWatched = first(raw.watched);
  const watchNextOnly = parseToggle(
    raw.watchNext,
    "The Watch Next filter",
    warnings,
  );

  const mood =
    !rawMood || rawMood === "any"
      ? "any"
      : isMoodKey(rawMood)
        ? rawMood
        : "any";
  if (rawMood && rawMood !== "any" && !isMoodKey(rawMood)) {
    warnings.push("The mood was ignored because it was invalid.");
  }

  const releasePeriod =
    rawPeriod &&
    (PICKER_RELEASE_PERIODS as readonly string[]).includes(rawPeriod)
      ? (rawPeriod as PickerReleasePeriod)
      : "any";
  if (
    rawPeriod &&
    !(PICKER_RELEASE_PERIODS as readonly string[]).includes(rawPeriod)
  ) {
    warnings.push("The release period was ignored because it was invalid.");
  }

  const watchedState =
    rawWatched &&
    (PICKER_WATCHED_STATES as readonly string[]).includes(rawWatched)
      ? (rawWatched as PickerFilters["watchedState"])
      : DEFAULT_PICKER_FILTERS.watchedState;
  if (
    rawWatched &&
    !(PICKER_WATCHED_STATES as readonly string[]).includes(rawWatched)
  ) {
    warnings.push("The watched-state filter was ignored because it was invalid.");
  }
  if (watchNextOnly && watchedState === "watched") {
    warnings.push(
      "Watch Next only overrides the watched-state filter because queued movies are unwatched.",
    );
  }

  return {
    filters: {
      genre: parseGenre(raw.genre, availableGenres, warnings),
      maxRuntime: parseRuntime(raw.maxRuntime, warnings),
      minPublicRating: parseMinimumPublicRating(raw.minRating, warnings),
      mood,
      releasePeriod,
      watchedState,
      watchNextOnly,
      favouriteOnly: parseToggle(
        raw.favourite,
        "The favourite filter",
        warnings,
      ),
    },
    warnings,
  };
}

export function pickerFiltersToSearchParams(filters: PickerFilters) {
  const params = new URLSearchParams();

  if (filters.genre) params.set("genre", filters.genre);
  if (filters.maxRuntime !== null) {
    params.set("maxRuntime", String(filters.maxRuntime));
  }
  if (filters.minPublicRating !== null) {
    params.set("minRating", String(filters.minPublicRating));
  }
  if (filters.mood !== "any") params.set("mood", filters.mood);
  if (filters.releasePeriod !== "any") {
    params.set("period", filters.releasePeriod);
  }
  if (filters.watchedState !== DEFAULT_PICKER_FILTERS.watchedState) {
    params.set("watched", filters.watchedState);
  }
  if (filters.watchNextOnly) params.set("watchNext", "1");
  if (filters.favouriteOnly) params.set("favourite", "1");

  return params;
}

export function getAvailableGenres(movies: readonly DiscoveryMovie[]) {
  return normalizeGenreLabels(movies.flatMap((movie) => movie.genres));
}

function matchesReleasePeriod(
  releaseYear: number | null,
  period: PickerReleasePeriod,
) {
  if (period === "any") {
    return true;
  }

  if (releaseYear === null || !Number.isSafeInteger(releaseYear)) {
    return false;
  }

  if (period === "before_1980") {
    return releaseYear < 1980;
  }

  const start = Number.parseInt(period.slice(0, 4), 10);
  return releaseYear >= start && releaseYear <= start + 9;
}

export function matchesPickerFilters(
  movie: DiscoveryMovie,
  filters: PickerFilters,
) {
  if (filters.watchNextOnly) {
    if (movie.status !== "watch_next") {
      return false;
    }
  } else if (
    (filters.watchedState === "watched" && movie.status !== "watched") ||
    (filters.watchedState === "unwatched" && movie.status === "watched")
  ) {
    return false;
  }

  if (filters.favouriteOnly && !movie.favourite) {
    return false;
  }

  const genreKeys = new Set(
    movie.genres
      .map(genreComparisonKey)
      .filter((genre): genre is string => Boolean(genre)),
  );
  if (
    filters.genre &&
    !genreKeys.has(genreComparisonKey(filters.genre) ?? "")
  ) {
    return false;
  }

  if (
    filters.maxRuntime !== null &&
    (movie.runtimeMinutes === null ||
      movie.runtimeMinutes > filters.maxRuntime)
  ) {
    return false;
  }

  if (
    filters.minPublicRating !== null &&
    (movie.publicRating === null ||
      movie.publicRating < filters.minPublicRating)
  ) {
    return false;
  }

  if (!matchesReleasePeriod(movie.releaseYear, filters.releasePeriod)) {
    return false;
  }

  return (
    filters.mood === "any" ||
    matchesMood(movie.genres, movie.runtimeMinutes, filters.mood)
  );
}

export function filterPickerCandidates(
  movies: readonly DiscoveryMovie[],
  filters: PickerFilters,
) {
  return movies.filter((movie) => matchesPickerFilters(movie, filters));
}

export function validateExcludedUserMovieIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new PickerInputError("The recent movie selection was invalid.");
  }

  if (value.length > MAX_PICKER_EXCLUSIONS) {
    throw new PickerInputError(
      `Only the ${MAX_PICKER_EXCLUSIONS} most recent picks can be excluded.`,
    );
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string" || !UUID_PATTERN.test(item.trim())) {
      throw new PickerInputError("The recent movie selection was invalid.");
    }

    const id = item.trim().toLocaleLowerCase("en-US");
    if (!seen.has(id)) {
      ids.push(id);
      seen.add(id);
    }
  }

  return ids;
}

function secureRandom() {
  if (!globalThis.crypto?.getRandomValues) {
    throw new PickerInputError("Secure movie selection is unavailable.");
  }

  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0]! / 0x1_0000_0000;
}

function randomIndex(length: number, random: () => number) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new PickerInputError("The random movie selection was invalid.");
  }

  return Math.floor(value * length);
}

const RELEASE_PERIOD_LABELS: Record<PickerReleasePeriod, string> = {
  any: "any release period",
  before_1980: "before 1980",
  "1980s": "the 1980s",
  "1990s": "the 1990s",
  "2000s": "the 2000s",
  "2010s": "the 2010s",
  "2020s": "the 2020s",
};

export function getPickerMatchReasons(
  movie: DiscoveryMovie,
  filters: PickerFilters,
) {
  const reasons: string[] = [];

  if (filters.watchNextOnly) {
    reasons.push("It is already in your Watch Next queue.");
  } else if (filters.watchedState === "watched") {
    reasons.push("It is marked as watched in your library.");
  } else if (filters.watchedState === "unwatched") {
    reasons.push("It is currently unwatched in your library.");
  }

  if (filters.genre) {
    reasons.push(`It matches your ${filters.genre} genre filter.`);
  }
  if (filters.mood !== "any") {
    reasons.push(MOOD_RULES[filters.mood].explanation);
  }
  if (filters.maxRuntime !== null && movie.runtimeMinutes !== null) {
    reasons.push(
      `Its ${movie.runtimeMinutes}-minute runtime is within your ${filters.maxRuntime}-minute limit.`,
    );
  }
  if (
    filters.minPublicRating !== null &&
    movie.publicRating !== null
  ) {
    reasons.push(
      `Its public rating of ${movie.publicRating}/10 meets your ${filters.minPublicRating}+ minimum.`,
    );
  }
  if (filters.releasePeriod !== "any") {
    reasons.push(
      `Its release year matches ${RELEASE_PERIOD_LABELS[filters.releasePeriod]}.`,
    );
  }
  if (filters.favouriteOnly) {
    reasons.push("It is marked as a favourite in your library.");
  }

  if (reasons.length === 0) {
    reasons.push("It is eligible under your current library filters.");
  }

  return reasons;
}

function toPickerResultMovie(movie: DiscoveryMovie): PickerResultMovie {
  return {
    userMovieId: movie.userMovieId,
    movieId: movie.movieId,
    status: movie.status,
    favourite: movie.favourite,
    title: movie.title,
    originalTitle: movie.originalTitle,
    posterPath: movie.posterPath,
    releaseYear: movie.releaseYear,
    runtimeMinutes: movie.runtimeMinutes,
    genres: movie.genres,
    director: movie.director,
    publicRating: movie.publicRating,
  };
}

export function pickRandomMovie(
  movies: readonly DiscoveryMovie[],
  filters: PickerFilters,
  excludedUserMovieIds: unknown = [],
  random: () => number = secureRandom,
): PickerResult {
  const excluded = new Set(
    validateExcludedUserMovieIds(excludedUserMovieIds),
  );
  const eligible = filterPickerCandidates(movies, filters);
  const unseen = eligible.filter(
    (movie) =>
      !excluded.has(movie.userMovieId.toLocaleLowerCase("en-US")),
  );
  const exclusionCycleReset = eligible.length > 0 && unseen.length === 0;
  const pool = exclusionCycleReset ? eligible : unseen;
  const movie =
    pool.length > 0 ? pool[randomIndex(pool.length, random)] ?? null : null;

  return {
    movie: movie ? toPickerResultMovie(movie) : null,
    reasons: movie ? getPickerMatchReasons(movie, filters) : [],
    eligibleCount: eligible.length,
    exclusionCycleReset,
  };
}
