import {
  LIBRARY_MOVIE_STATUSES,
  type LibraryMovieStatus,
  type LibraryMovieSummary,
} from "@/lib/movies/types";

import {
  EMPTY_LIBRARY_FACETS,
  type LibraryFacets,
} from "./query";

type UnknownRecord = Record<string, unknown>;

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

function asStatus(value: unknown): LibraryMovieStatus {
  return typeof value === "string" &&
    LIBRARY_MOVIE_STATUSES.includes(value as LibraryMovieStatus)
    ? (value as LibraryMovieStatus)
    : "want_to_watch";
}

function normalizeLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const labels = new Map<string, string>();

  for (const item of value) {
    const label = asString(item)?.replace(/\s+/g, " ").trim();
    if (label) {
      labels.set(label.toLocaleLowerCase(), label);
    }
  }

  return [...labels.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function nonNegativeCount(value: unknown) {
  const count = asInteger(value);
  return count !== null && count >= 0 ? count : 0;
}

export function mapLibraryQueryRow(value: unknown): LibraryMovieSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const libraryId = asString(value.user_movie_id);
  const movieId = asString(value.movie_id);
  const tmdbId = asInteger(value.tmdb_id);

  if (!libraryId || !movieId || tmdbId === null || tmdbId <= 0) {
    return null;
  }

  const publicRating = asNumber(value.public_rating);
  const releaseYear = asInteger(value.release_year);

  return {
    libraryId,
    status: asStatus(value.status),
    favourite: value.favourite === true,
    addedAt: asString(value.added_at),
    personalRating: asNumber(value.personal_rating),
    priority: asInteger(value.priority) ?? 0,
    watchedAt: asString(value.watched_at),
    movie: {
      id: movieId,
      tmdbId,
      title: asString(value.title) ?? "Untitled movie",
      originalTitle: asString(value.original_title),
      posterPath: asString(value.poster_path),
      releaseDate: asString(value.release_date),
      releaseYear,
      voteAverage:
        publicRating !== null && publicRating > 0 ? publicRating : null,
    },
  };
}

export function mapLibraryQueryRows(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(mapLibraryQueryRow)
    .filter((item): item is LibraryMovieSummary => Boolean(item));
}

export function mapLibraryFacets(value: unknown): LibraryFacets {
  if (!isRecord(value)) {
    return EMPTY_LIBRARY_FACETS;
  }

  const counts = isRecord(value.counts) ? value.counts : {};
  const years = Array.isArray(value.years)
    ? [
        ...new Set(
          value.years
            .map(asInteger)
            .filter((year): year is number => year !== null),
        ),
      ].sort((left, right) => right - left)
    : [];

  return {
    genres: normalizeLabels(value.genres),
    directors: normalizeLabels(value.directors),
    years,
    counts: {
      all: nonNegativeCount(counts.all),
      watched: nonNegativeCount(counts.watched),
      unwatched: nonNegativeCount(counts.unwatched),
      favourites: nonNegativeCount(counts.favourites),
    },
  };
}

