import {
  LIBRARY_MOVIE_STATUSES,
  type LibraryMovieStatus,
} from "@/lib/movies/types";

import type {
  StatisticsMovieRecord,
  StatisticsMovieStatus,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EARLIEST_MOVIE_YEAR = 1888;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asUuid(value: unknown) {
  const parsed = normalizedText(value);
  return parsed && UUID_PATTERN.test(parsed) ? parsed : null;
}

function asPositiveDatabaseId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }

  const parsed = normalizedText(value);
  return parsed && /^[1-9]\d*$/.test(parsed) ? parsed : null;
}

function asStatus(value: unknown): StatisticsMovieStatus {
  return typeof value === "string" &&
    LIBRARY_MOVIE_STATUSES.includes(value as LibraryMovieStatus)
    ? (value as LibraryMovieStatus)
    : "unknown";
}

function asPersonalRating(value: unknown) {
  const parsed = asNumber(value);
  return parsed !== null && parsed >= 0 && parsed <= 10 ? parsed : null;
}

function asRuntime(value: unknown) {
  const parsed = asNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

function asReleaseYear(value: unknown) {
  const parsed = asNumber(value);
  const latestYear = new Date().getUTCFullYear() + 5;
  return parsed !== null &&
    Number.isSafeInteger(parsed) &&
    parsed >= EARLIEST_MOVIE_YEAR &&
    parsed <= latestYear
    ? parsed
    : null;
}

function isRealCalendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function normalizeStatisticsWatchedDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(normalized);
  if (!match) {
    return null;
  }

  if (normalized.length > 10 && Number.isNaN(new Date(normalized).getTime())) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isRealCalendarDate(year, month, day)
    ? `${match[1]}-${match[2]}-${match[3]}`
    : null;
}

function asScheduledInstant(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : value;
}

function relatedMovie(value: unknown) {
  if (isRecord(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.find(isRecord) ?? null;
  }

  return null;
}

export function normalizeStatisticsGenres(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const labels = new Map<string, string>();

  for (const item of value) {
    const rawLabel = isRecord(item)
      ? item.name
      : typeof item === "string"
        ? item
        : null;
    const label = normalizedText(rawLabel);

    if (label && !labels.has(label.toLocaleLowerCase("en-US"))) {
      labels.set(label.toLocaleLowerCase("en-US"), label);
    }
  }

  return [...labels.values()].sort((left, right) =>
    left.localeCompare(right, "en", { sensitivity: "base" }),
  );
}

export function mapStatisticsMovieRow(
  value: unknown,
): StatisticsMovieRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const userMovieId = asUuid(value.id);
  const movie = relatedMovie(value.movies);
  const movieId = movie ? asPositiveDatabaseId(movie.id) : null;

  if (!userMovieId || !movie || !movieId) {
    return null;
  }

  return {
    userMovieId,
    movieId,
    status: asStatus(value.status),
    favourite: value.favourite === true,
    personalRating: asPersonalRating(value.personal_rating),
    watchedDate: normalizeStatisticsWatchedDate(value.watched_at),
    scheduledFor: asScheduledInstant(value.scheduled_for),
    title: normalizedText(movie.title) ?? "Untitled movie",
    posterPath: normalizedText(movie.poster_path),
    releaseYear: asReleaseYear(movie.release_year),
    runtimeMinutes: asRuntime(movie.runtime_minutes),
    genres: normalizeStatisticsGenres(movie.genres),
  };
}

export function mapStatisticsMovieRows(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(mapStatisticsMovieRow)
    .filter((movie): movie is StatisticsMovieRecord => movie !== null);
}
