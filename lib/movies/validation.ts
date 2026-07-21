import { EmptyMovieQueryError, InvalidMovieIdError } from "./errors";

export function validateMovieSearchQuery(query: string) {
  const normalized = query.trim().replace(/\s+/g, " ");

  if (!normalized) {
    throw new EmptyMovieQueryError();
  }

  return normalized;
}

export function validateTmdbId(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidMovieIdError();
  }

  return value;
}
