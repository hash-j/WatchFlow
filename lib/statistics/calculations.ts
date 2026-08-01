import {
  LIBRARY_MOVIE_STATUSES,
  LIBRARY_MOVIE_STATUS_LABELS,
} from "@/lib/movies/types";
import { normalizeTimeZone } from "@/lib/library/timezone";

import type {
  StatisticsGenreEntry,
  StatisticsMovieRecord,
  StatisticsRatingEntry,
  StatisticsResult,
  StatisticsStatusBreakdown,
  StatisticsTimelineEntry,
} from "./types";

export const MAX_STATISTICS_GENRES = 8;
export const MAX_STATISTICS_MOVIES = 5;
export const STATISTICS_TIMELINE_MONTHS = 12;

const ratingBuckets = [
  { key: "0-2", label: "0–2", maximum: 2 },
  { key: "2-4", label: ">2–4", maximum: 4 },
  { key: "4-6", label: ">4–6", maximum: 6 },
  { key: "6-8", label: ">6–8", maximum: 8 },
  { key: "8-10", label: ">8–10", maximum: 10 },
] as const;

function roundOne(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function percentage(count: number, total: number) {
  return total > 0 ? roundOne((count / total) * 100) : 0;
}

function isValidRating(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 10;
}

function isValidRuntime(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value > 0;
}

function isValidCalendarDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidScheduledInstant(value: string | null) {
  return value !== null && !Number.isNaN(new Date(value).getTime());
}

function zonedYearMonth(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return { year: values.year, month: values.month };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function buildTimeline(
  movies: readonly StatisticsMovieRecord[],
  currentYear: number,
  currentMonth: number,
) {
  const entries: StatisticsTimelineEntry[] = [];

  for (
    let offset = STATISTICS_TIMELINE_MONTHS - 1;
    offset >= 0;
    offset -= 1
  ) {
    const date = new Date(Date.UTC(currentYear, currentMonth - 1 - offset, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    entries.push({
      monthKey: monthKey(year, month),
      label: monthLabel(year, month),
      count: 0,
    });
  }

  const byMonth = new Map(entries.map((entry) => [entry.monthKey, entry]));
  for (const movie of movies) {
    if (
      movie.status !== "watched" ||
      !isValidCalendarDate(movie.watchedDate)
    ) {
      continue;
    }

    const entry = byMonth.get(movie.watchedDate.slice(0, 7));
    if (entry) {
      entry.count += 1;
    }
  }

  return entries;
}

function buildGenreDistribution(movies: readonly StatisticsMovieRecord[]) {
  const genreCounts = new Map<string, { genre: string; count: number }>();

  for (const movie of movies) {
    const movieGenres = new Map<string, string>();
    for (const rawGenre of movie.genres) {
      const genre = rawGenre.replace(/\s+/g, " ").trim();
      const key = genre.toLocaleLowerCase("en-US");
      if (genre && !movieGenres.has(key)) {
        movieGenres.set(key, genre);
      }
    }

    for (const [key, genre] of movieGenres) {
      const current = genreCounts.get(key);
      genreCounts.set(key, {
        genre: current?.genre ?? genre,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return [...genreCounts.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.genre.localeCompare(right.genre, "en", { sensitivity: "base" }),
    )
    .slice(0, MAX_STATISTICS_GENRES)
    .map<StatisticsGenreEntry>((entry) => ({
      ...entry,
      percentage: percentage(entry.count, movies.length),
    }));
}

function buildRatingDistribution(ratings: readonly number[]) {
  const entries: StatisticsRatingEntry[] = ratingBuckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: 0,
    percentage: 0,
  }));

  for (const rating of ratings) {
    const index = ratingBuckets.findIndex(
      (bucket) => rating <= bucket.maximum,
    );
    entries[Math.max(index, 0)].count += 1;
  }

  return entries.map((entry) => ({
    ...entry,
    percentage: percentage(entry.count, ratings.length),
  }));
}

function compareTitle(left: StatisticsMovieRecord, right: StatisticsMovieRecord) {
  return left.title.localeCompare(right.title, "en", { sensitivity: "base" });
}

function compareStableIdentity(
  left: StatisticsMovieRecord,
  right: StatisticsMovieRecord,
) {
  return (
    compareTitle(left, right) ||
    left.movieId.localeCompare(right.movieId) ||
    left.userMovieId.localeCompare(right.userMovieId)
  );
}

export function calculatePersonalStatistics(
  movies: readonly StatisticsMovieRecord[],
  options: {
    timezone?: string;
    now?: Date;
    totalCount?: number;
  } = {},
): StatisticsResult {
  const timezone = normalizeTimeZone(options.timezone);
  const now = options.now ?? new Date();
  const current = zonedYearMonth(now, timezone);
  const currentMonthKey = monthKey(current.year, current.month);
  const suppliedTotal = options.totalCount;
  const totalMovies =
    typeof suppliedTotal === "number" &&
    Number.isSafeInteger(suppliedTotal) &&
    suppliedTotal >= movies.length
      ? suppliedTotal
      : movies.length;
  const watched = movies.filter((movie) => movie.status === "watched");
  const ratings = movies.flatMap((movie) =>
    isValidRating(movie.personalRating) ? [movie.personalRating] : [],
  );
  const watchedRuntimes = watched.flatMap((movie) =>
    isValidRuntime(movie.runtimeMinutes) ? [movie.runtimeMinutes] : [],
  );
  const averagePersonalRating = ratings.length
    ? roundOne(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length)
    : null;
  const totalWatchedRuntimeMinutes = watchedRuntimes.length
    ? watchedRuntimes.reduce((sum, runtime) => sum + runtime, 0)
    : null;

  const knownStatusCounts = new Map(
    LIBRARY_MOVIE_STATUSES.map((status) => [status, 0]),
  );
  let unknownStatusCount = 0;

  for (const movie of movies) {
    if (movie.status === "unknown") {
      unknownStatusCount += 1;
    } else {
      knownStatusCounts.set(
        movie.status,
        (knownStatusCounts.get(movie.status) ?? 0) + 1,
      );
    }
  }

  const statusBreakdown: StatisticsStatusBreakdown[] = LIBRARY_MOVIE_STATUSES.map((status) => ({
    status,
    label: LIBRARY_MOVIE_STATUS_LABELS[status],
    count: knownStatusCounts.get(status) ?? 0,
    percentage: percentage(knownStatusCounts.get(status) ?? 0, movies.length),
  })).filter((entry) => entry.count > 0);

  if (unknownStatusCount > 0) {
    statusBreakdown.push({
      status: "unknown",
      label: "Unknown status",
      count: unknownStatusCount,
      percentage: percentage(unknownStatusCount, movies.length),
    });
  }

  const topRatedWatched = watched
    .filter(
      (movie): movie is StatisticsMovieRecord & { personalRating: number } =>
        isValidRating(movie.personalRating),
    )
    .sort(
      (left, right) =>
        right.personalRating - left.personalRating ||
        (right.watchedDate ?? "").localeCompare(left.watchedDate ?? "") ||
        compareStableIdentity(left, right),
    )
    .slice(0, MAX_STATISTICS_MOVIES)
    .map((movie) => ({
      userMovieId: movie.userMovieId,
      movieId: movie.movieId,
      title: movie.title,
      posterPath: movie.posterPath,
      releaseYear: movie.releaseYear,
      personalRating: movie.personalRating,
      watchedDate: movie.watchedDate,
    }));

  const recentlyWatched = watched
    .filter(
      (movie): movie is StatisticsMovieRecord & { watchedDate: string } =>
        isValidCalendarDate(movie.watchedDate),
    )
    .sort(
      (left, right) =>
        right.watchedDate.localeCompare(left.watchedDate) ||
        compareStableIdentity(left, right),
    )
    .slice(0, MAX_STATISTICS_MOVIES)
    .map((movie) => ({
      userMovieId: movie.userMovieId,
      movieId: movie.movieId,
      title: movie.title,
      posterPath: movie.posterPath,
      releaseYear: movie.releaseYear,
      personalRating: movie.personalRating,
      watchedDate: movie.watchedDate,
    }));

  return {
    timezone,
    coverage: {
      totalMovies,
      analyzedMovies: movies.length,
      complete: totalMovies === movies.length,
    },
    summary: {
      totalMovies,
      watchedMovies: watched.length,
      unwatchedMovies: movies.length - watched.length,
      watchNextMovies: knownStatusCounts.get("watch_next") ?? 0,
      favouriteMovies: movies.filter((movie) => movie.favourite).length,
      scheduledMovies: movies.filter(
        (movie) =>
          movie.status === "scheduled" &&
          isValidScheduledInstant(movie.scheduledFor),
      ).length,
      averagePersonalRating,
      ratedMovies: ratings.length,
      totalWatchedRuntimeMinutes,
      watchedRuntimeMovies: watchedRuntimes.length,
      watchedThisMonth: watched.filter(
        (movie) =>
          isValidCalendarDate(movie.watchedDate) &&
          movie.watchedDate.slice(0, 7) === currentMonthKey,
      ).length,
      watchedThisYear: watched.filter(
        (movie) =>
          isValidCalendarDate(movie.watchedDate) &&
          movie.watchedDate.slice(0, 4) === String(current.year),
      ).length,
    },
    statusBreakdown,
    genres: buildGenreDistribution(movies),
    timeline: buildTimeline(movies, current.year, current.month),
    ratingDistribution: buildRatingDistribution(ratings),
    topRatedWatched,
    recentlyWatched,
    emptyState: {
      emptyLibrary: totalMovies === 0,
      noWatchedMovies: watched.length === 0,
      noPersonalRatings: ratings.length === 0,
    },
    period: {
      currentMonthKey,
      currentMonthLabel: monthLabel(current.year, current.month),
      currentYear: current.year,
    },
  };
}
