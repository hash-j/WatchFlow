import {
  EmptyMovieQueryError,
  InvalidMovieIdError,
  MovieSearchValidationError,
} from "./errors";

export function validateMovieSearchQuery(query: string) {
  const normalized = query.normalize("NFKC").trim().replace(/\s+/g, " ");

  if (!normalized) {
    throw new EmptyMovieQueryError();
  }

  if ([...normalized].length > 120) {
    throw new MovieSearchValidationError();
  }

  return normalized;
}

export function validateTmdbId(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidMovieIdError();
  }

  return value;
}
