import {
  LIBRARY_MOVIE_STATUSES,
  type LibraryMovieStatus,
} from "@/lib/movies/types";

import { ListsPersistenceError } from "./errors";
import type {
  CustomList,
  CustomListMovie,
  CustomListSummary,
  ListMovieCandidate,
  ListMutationResult,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as UnknownRecord;
}

function relatedRecord(value: unknown) {
  if (Array.isArray(value)) {
    return record(value[0]);
  }

  return record(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function requiredText(value: unknown, label: string) {
  const mapped = text(value);
  if (!mapped) {
    throw new ListsPersistenceError(
      `The custom-list ${label} response was invalid. Please try again.`,
    );
  }

  return mapped;
}

function identifier(value: unknown, label: string) {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return String(value);
  }

  return requiredText(value, label);
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function nonNegativeInteger(value: unknown) {
  const mapped = number(value);
  return mapped !== null &&
    Number.isSafeInteger(mapped) &&
    mapped >= 0
    ? mapped
    : null;
}

function positiveInteger(value: unknown) {
  const mapped = nonNegativeInteger(value);
  return mapped !== null && mapped >= 1 ? mapped : null;
}

function movieStatus(value: unknown): LibraryMovieStatus | null {
  return typeof value === "string" &&
    (LIBRARY_MOVIE_STATUSES as readonly string[]).includes(value)
    ? (value as LibraryMovieStatus)
    : null;
}

export function mapCustomList(value: unknown): CustomList {
  const row = record(value);
  if (!row) {
    throw new ListsPersistenceError(
      "The custom-list response was invalid. Please try again.",
    );
  }

  const visibility = text(row.visibility);
  if (visibility !== "private") {
    throw new ListsPersistenceError(
      "The custom-list privacy response was invalid. Please try again.",
    );
  }

  return {
    id: requiredText(row.id ?? row.list_id, "identifier"),
    name: requiredText(row.name, "name"),
    description: text(row.description),
    visibility,
    createdAt: requiredText(row.created_at, "created date"),
    updatedAt: requiredText(row.updated_at, "updated date"),
  };
}

export function mapCustomListSummaries(
  value: unknown,
): CustomListSummary[] {
  if (!Array.isArray(value)) {
    throw new ListsPersistenceError(
      "The custom-list summary response was invalid. Please try again.",
    );
  }

  return value.map((rowValue) => {
    const row = record(rowValue);
    const list = mapCustomList(rowValue);
    const movieCount = nonNegativeInteger(row?.movie_count);
    const rawPosters = row?.poster_paths;

    if (movieCount === null || !Array.isArray(rawPosters)) {
      throw new ListsPersistenceError(
        "The custom-list summary response was invalid. Please try again.",
      );
    }

    return {
      ...list,
      movieCount,
      posterPaths: rawPosters
        .filter((path): path is string => typeof path === "string")
        .slice(0, 4),
    };
  });
}

export function mapCustomListMovies(value: unknown): CustomListMovie[] {
  if (!Array.isArray(value)) {
    throw new ListsPersistenceError(
      "The list movie response was invalid. Please try again.",
    );
  }

  return value.map((rowValue) => {
    const row = record(rowValue);
    const userMovie = relatedRecord(row?.user_movies);
    const movie = relatedRecord(userMovie?.movies);
    const status = movieStatus(userMovie?.status);
    const position = positiveInteger(row?.position);

    if (!row || !userMovie || !movie || !status || position === null) {
      throw new ListsPersistenceError(
        "The list movie response was invalid. Please try again.",
      );
    }

    return {
      listMovieId: requiredText(row.id, "movie membership"),
      listId: requiredText(row.list_id, "identifier"),
      userMovieId: requiredText(row.user_movie_id, "library relationship"),
      position,
      status,
      personalRating: number(userMovie.personal_rating),
      favourite: userMovie.favourite === true,
      movie: {
        id: identifier(userMovie.movie_id ?? movie.id, "movie identifier"),
        title: requiredText(movie.title, "movie title"),
        originalTitle: text(movie.original_title),
        posterPath: text(movie.poster_path),
        releaseDate: text(movie.release_date),
        releaseYear: number(movie.release_year),
      },
    };
  });
}

export function mapListMovieCandidates(
  value: unknown,
  alreadyAddedIds: ReadonlySet<string>,
): ListMovieCandidate[] {
  if (!Array.isArray(value)) {
    throw new ListsPersistenceError(
      "The movie picker response was invalid. Please try again.",
    );
  }

  return value.map((rowValue) => {
    const row = record(rowValue);
    const status = movieStatus(row?.status);
    if (!row || !status) {
      throw new ListsPersistenceError(
        "The movie picker response was invalid. Please try again.",
      );
    }

    const userMovieId = requiredText(
      row.user_movie_id,
      "library relationship",
    );

    return {
      userMovieId,
      movieId: identifier(row.movie_id, "movie identifier"),
      title: requiredText(row.title, "movie title"),
      originalTitle: text(row.original_title),
      posterPath: text(row.poster_path),
      releaseDate: text(row.release_date),
      releaseYear: number(row.release_year),
      status,
      personalRating: number(row.personal_rating),
      favourite: row.favourite === true,
      alreadyAdded: alreadyAddedIds.has(userMovieId),
    };
  });
}

export function mapListMutationResult(value: unknown): ListMutationResult {
  const row = record(value);
  if (!row || typeof row.success !== "boolean") {
    throw new ListsPersistenceError(
      "The custom-list update returned an invalid response. Please try again.",
    );
  }

  const count = (key: string) => nonNegativeInteger(row[key]) ?? 0;

  return {
    success: row.success,
    reason: text(row.reason),
    listId: text(row.list_id),
    moved: typeof row.moved === "boolean" ? row.moved : null,
    removed: typeof row.removed === "boolean" ? row.removed : null,
    finalPosition: positiveInteger(row.final_position),
    requested: count("requested"),
    matched: count("matched"),
    added: count("added_count"),
    removedCount: count("removed_count"),
    skipped: count("skipped_count"),
    unchanged: count("unchanged_count"),
  };
}
