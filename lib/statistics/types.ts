import type { LibraryMovieStatus } from "@/lib/movies/types";

export type StatisticsMovieStatus = LibraryMovieStatus | "unknown";

export type StatisticsMovieRecord = {
  userMovieId: string;
  movieId: string;
  status: StatisticsMovieStatus;
  favourite: boolean;
  personalRating: number | null;
  watchedDate: string | null;
  scheduledFor: string | null;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  genres: string[];
};

export type StatisticsSummary = {
  totalMovies: number;
  watchedMovies: number;
  unwatchedMovies: number;
  watchNextMovies: number;
  favouriteMovies: number;
  scheduledMovies: number;
  averagePersonalRating: number | null;
  ratedMovies: number;
  totalWatchedRuntimeMinutes: number | null;
  watchedRuntimeMovies: number;
  watchedThisMonth: number;
  watchedThisYear: number;
};

export type StatisticsStatusBreakdown = {
  status: StatisticsMovieStatus;
  label: string;
  count: number;
  percentage: number;
};

export type StatisticsGenreEntry = {
  genre: string;
  count: number;
  percentage: number;
};

export type StatisticsTimelineEntry = {
  monthKey: string;
  label: string;
  count: number;
};

export type StatisticsRatingEntry = {
  key: "0-2" | "2-4" | "4-6" | "6-8" | "8-10";
  label: string;
  count: number;
  percentage: number;
};

export type StatisticsTopMovie = {
  userMovieId: string;
  movieId: string;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  personalRating: number;
  watchedDate: string | null;
};

export type StatisticsRecentActivity = {
  userMovieId: string;
  movieId: string;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  personalRating: number | null;
  watchedDate: string;
};

export type StatisticsCoverage = {
  totalMovies: number;
  analyzedMovies: number;
  complete: boolean;
};

export type StatisticsEmptyState = {
  emptyLibrary: boolean;
  noWatchedMovies: boolean;
  noPersonalRatings: boolean;
};

export type StatisticsPeriod = {
  currentMonthKey: string;
  currentMonthLabel: string;
  currentYear: number;
};

export type StatisticsResult = {
  timezone: string;
  coverage: StatisticsCoverage;
  summary: StatisticsSummary;
  statusBreakdown: StatisticsStatusBreakdown[];
  genres: StatisticsGenreEntry[];
  timeline: StatisticsTimelineEntry[];
  ratingDistribution: StatisticsRatingEntry[];
  topRatedWatched: StatisticsTopMovie[];
  recentlyWatched: StatisticsRecentActivity[];
  emptyState: StatisticsEmptyState;
  period: StatisticsPeriod;
};

export type StatisticsDataset = {
  movies: StatisticsMovieRecord[];
  totalCount: number;
  truncated: boolean;
};
