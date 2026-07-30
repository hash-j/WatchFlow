import {
  LIBRARY_MOVIE_STATUSES,
  type LibraryMovieStatus,
} from "@/lib/movies/types";

import type { DiscoveryMovie } from "./types";

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EARLIEST_MOVIE_YEAR = 1888;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function normalizedText(value: unknown) {
  return asString(value)?.replace(/\s+/g, " ").trim() ?? null;
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

function asInteger(value: unknown) {
  const parsed = asNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function boundedNumber(value: unknown, minimum: number, maximum: number) {
  const parsed = asNumber(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  const parsed = asInteger(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function asStatus(value: unknown): LibraryMovieStatus | null {
  return typeof value === "string" &&
    LIBRARY_MOVIE_STATUSES.includes(value as LibraryMovieStatus)
    ? (value as LibraryMovieStatus)
    : null;
}

function asUuid(value: unknown) {
  const parsed = asString(value);
  return parsed && UUID_PATTERN.test(parsed) ? parsed : null;
}

function asPositiveDatabaseId(value: unknown) {
  const parsed = asString(value);
  return parsed && /^[1-9]\d*$/.test(parsed) ? parsed : null;
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

export function normalizeDiscoveryGenres(value: unknown) {
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
    if (label && !labels.has(label.toLowerCase())) {
      labels.set(label.toLowerCase(), label);
    }
  }

  return [...labels.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function mapDiscoveryMovieRow(value: unknown): DiscoveryMovie | null {
  if (!isRecord(value)) {
    return null;
  }

  const movie = relatedMovie(value.movies);
  const userMovieId = asUuid(value.id);
  const movieId = movie ? asPositiveDatabaseId(movie.id) : null;
  const status = asStatus(value.status);

  if (
    !movie ||
    !userMovieId ||
    !movieId ||
    !status
  ) {
    return null;
  }

  const title = normalizedText(movie.title) ?? "Untitled movie";
  const originalTitle = normalizedText(movie.original_title);
  const maximumReleaseYear = new Date().getUTCFullYear() + 5;

  return {
    userMovieId,
    movieId,
    status,
    favourite: value.favourite === true,
    personalRating: boundedNumber(value.personal_rating, 0, 10),
    title,
    originalTitle:
      originalTitle && originalTitle !== title ? originalTitle : null,
    posterPath: asString(movie.poster_path),
    releaseYear: boundedInteger(
      movie.release_year,
      EARLIEST_MOVIE_YEAR,
      maximumReleaseYear,
    ),
    runtimeMinutes: boundedInteger(
      movie.runtime_minutes,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    genres: normalizeDiscoveryGenres(movie.genres),
    director: normalizedText(movie.director),
    publicRating: boundedNumber(movie.public_rating, 0, 10),
  };
}

export function mapDiscoveryMovieRows(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(mapDiscoveryMovieRow)
    .filter((movie): movie is DiscoveryMovie => movie !== null);
}
