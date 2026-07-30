import type { LibraryMovieStatus } from "@/lib/movies/types";

export type DiscoveryMovie = {
  userMovieId: string;
  movieId: string;
  status: LibraryMovieStatus;
  favourite: boolean;
  personalRating: number | null;
  title: string;
  originalTitle: string | null;
  posterPath: string | null;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  genres: string[];
  director: string | null;
  publicRating: number | null;
};

export type DiscoveryDataset = {
  movies: DiscoveryMovie[];
  totalCount: number;
  truncated: boolean;
};

export const MOOD_KEYS = [
  "exciting",
  "relaxing",
  "funny",
  "emotional",
  "dark",
  "intense",
  "mind_bending",
  "family_oriented",
] as const;

export type MoodKey = (typeof MOOD_KEYS)[number];
export type PickerMood = MoodKey | "any";

export type MoodDefinition = {
  key: MoodKey;
  label: string;
  genres: readonly string[];
  maxRuntime: number | null;
  explanation: string;
  caution: string | null;
};

export const PICKER_RUNTIME_OPTIONS = [90, 120, 150, 180] as const;
export type PickerMaximumRuntime =
  | (typeof PICKER_RUNTIME_OPTIONS)[number]
  | null;

export const PICKER_RELEASE_PERIODS = [
  "any",
  "before_1980",
  "1980s",
  "1990s",
  "2000s",
  "2010s",
  "2020s",
] as const;
export type PickerReleasePeriod = (typeof PICKER_RELEASE_PERIODS)[number];

export const PICKER_WATCHED_STATES = [
  "unwatched",
  "watched",
  "any",
] as const;
export type PickerWatchedState = (typeof PICKER_WATCHED_STATES)[number];

export type PickerFilters = {
  genre: string | null;
  maxRuntime: PickerMaximumRuntime;
  minPublicRating: number | null;
  mood: PickerMood;
  releasePeriod: PickerReleasePeriod;
  watchedState: PickerWatchedState;
  watchNextOnly: boolean;
  favouriteOnly: boolean;
};

export type RawPickerSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type ParsedPickerFilters = {
  filters: PickerFilters;
  warnings: string[];
};

export type PickerResultMovie = Omit<DiscoveryMovie, "personalRating">;

export type PickerResult = {
  movie: PickerResultMovie | null;
  reasons: string[];
  eligibleCount: number;
  exclusionCycleReset: boolean;
};

export type RecommendationSeedSource =
  | "high_rating"
  | "favourite_watched"
  | "rated_watched";

export type RecommendationSeed = {
  movie: DiscoveryMovie;
  source: RecommendationSeedSource;
};

export type RecommendationReasonKind =
  | "shared_genres"
  | "same_director"
  | "similar_release_period"
  | "similar_runtime"
  | "rated_genre"
  | "watched_genre"
  | "favourite_genre"
  | "rated_director"
  | "public_rating"
  | "favourite"
  | "watch_next";

export type RecommendationReason = {
  kind: RecommendationReasonKind;
  text: string;
};

export type RecommendationScoreBreakdown = {
  sharedGenres: string[];
  sharedGenrePoints: number;
  sameDirector: boolean;
  directorPoints: number;
  similarReleasePeriod: boolean;
  releasePeriodPoints: number;
  similarRuntime: boolean;
  runtimePoints: number;
  favouritePoints: number;
  watchNextPoints: number;
  publicRatingPoints: number;
  seedRatingPoints: number;
  total: number;
};

export type RecommendationItem = {
  movie: DiscoveryMovie;
  score: number;
  seed: RecommendationSeed | null;
  reasons: RecommendationReason[];
  breakdown: RecommendationScoreBreakdown | null;
};

export type RecommendationSection = {
  id: string;
  title: string;
  description: string;
  items: RecommendationItem[];
};

export type GenreInsightSource =
  | "rated"
  | "watched"
  | "favourite";

export type GenreInsight = {
  genre: string;
  score: number;
  movieCount: number;
  source: GenreInsightSource;
};

export type DirectorInsight = {
  director: string;
  averageRating: number;
  movieCount: number;
};

export type RecommendationBasis =
  | "high_ratings"
  | "favourite_watched"
  | "rated_watched"
  | "rated_genres"
  | "watched_genres"
  | "favourite_genres"
  | "public_ratings"
  | "none";

export type RecommendationColdStart =
  | "empty_library"
  | "no_eligible_candidates"
  | "no_ratings"
  | "no_suitable_recommendations"
  | null;

export type RecommendationResult = {
  sections: RecommendationSection[];
  seeds: RecommendationSeed[];
  genreInsights: GenreInsight[];
  directorInsights: DirectorInsight[];
  basis: RecommendationBasis;
  coldStart: RecommendationColdStart;
  notice: string | null;
  libraryCount: number;
  candidateCount: number;
  recommendationCount: number;
};
