import "server-only";

import type { MovieProvider, MovieProviderOptions } from "./provider";
import {
  MovieNotFoundError,
  MovieProviderError,
  MovieProviderRateLimitError,
  MovieProviderTimeoutError,
} from "./errors";
import { mapTmdbMovieDetails, mapTmdbSearchResponse } from "./tmdb-mapper";
import { validateMovieSearchQuery, validateTmdbId } from "./validation";

const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
const REQUEST_TIMEOUT_MS = 8_000;
const inFlightRequests = new Map<string, Promise<unknown>>();

function retryAfterSeconds(response: Response) {
  const value = Number(response.headers.get("retry-after"));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function requestTmdbUncached(path: string, params: URLSearchParams) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;

  if (!token) {
    throw new MovieProviderError("Movie search is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${TMDB_API_BASE_URL}${path}?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
        cache: "no-store",
      },
    );

    if (response.status === 404) {
      throw new MovieNotFoundError();
    }

    if (response.status === 429) {
      throw new MovieProviderRateLimitError(retryAfterSeconds(response));
    }

    if (!response.ok) {
      throw new MovieProviderError();
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (
      error instanceof MovieProviderError ||
      error instanceof MovieNotFoundError ||
      error instanceof MovieProviderRateLimitError
    ) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new MovieProviderTimeoutError();
    }

    throw new MovieProviderError();
  } finally {
    clearTimeout(timeout);
  }
}

async function requestTmdb(path: string, params: URLSearchParams) {
  const requestKey = `${path}?${params.toString()}`;
  const active = inFlightRequests.get(requestKey);
  if (active) {
    return active;
  }

  const pending = requestTmdbUncached(path, params).finally(() => {
    inFlightRequests.delete(requestKey);
  });
  inFlightRequests.set(requestKey, pending);
  return pending;
}

export class TmdbMovieProvider implements MovieProvider {
  async searchMovies(query: string, options: MovieProviderOptions = {}) {
    const normalizedQuery = validateMovieSearchQuery(query);
    const params = new URLSearchParams({
      query: normalizedQuery,
      include_adult: options.includeAdult ? "true" : "false",
      language: options.language ?? "en",
      page: "1",
    });
    const payload = await requestTmdb("/search/movie", params);

    const movies = mapTmdbSearchResponse(payload, {
      includeAdult: options.includeAdult,
    });

    if (options.includeUnreleased !== false) {
      return movies;
    }

    const today = new Date().toISOString().slice(0, 10);
    return movies.filter(
      (movie) => Boolean(movie.releaseDate) && movie.releaseDate! <= today,
    );
  }

  async getMovieDetails(tmdbId: number, options: MovieProviderOptions = {}) {
    const validTmdbId = validateTmdbId(tmdbId);
    const params = new URLSearchParams({
      append_to_response: "credits,videos",
      language: options.language ?? "en",
    });
    const payload = await requestTmdb(`/movie/${validTmdbId}`, params);

    return mapTmdbMovieDetails(payload, {
      includeAdult: options.includeAdult,
    });
  }
}

export const tmdbMovieProvider = new TmdbMovieProvider();
