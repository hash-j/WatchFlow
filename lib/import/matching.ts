import {
  MovieProviderError,
  MovieProviderRateLimitError,
  MovieProviderTimeoutError,
} from "../movies/errors";
import type { MovieSearchResult } from "../movies/types";
import { AuthenticationRequiredError } from "../library/errors";
import type {
  ImportMovieCandidate,
  ImportRowMatch,
  ValidatedImportRow,
} from "./types";
import { canMatchImportRow } from "./mapping";
import {
  movieTitleKey,
  normalizeMovieTitle,
} from "./title-normalization";

const MATCH_CONCURRENCY = 4;

export { normalizeMovieTitle } from "./title-normalization";

export type ImportAuthentication = {
  userId: string;
  client: unknown;
};

export interface ImportMatchingDependencies {
  authenticate(): Promise<ImportAuthentication | null>;
  searchMovies(
    session: ImportAuthentication,
    query: string,
  ): Promise<MovieSearchResult[]>;
}

function candidateYear(candidate: MovieSearchResult) {
  const value = candidate.releaseDate?.slice(0, 4) ?? "";
  return /^\d{4}$/.test(value) ? Number(value) : null;
}

function titleMatches(row: ValidatedImportRow, candidate: MovieSearchResult) {
  const imported = normalizeMovieTitle(row.title);
  if (!imported) return false;

  return [candidate.title, candidate.originalTitle]
    .filter((title): title is string => Boolean(title))
    .some((title) => normalizeMovieTitle(title) === imported);
}

function scoreCandidate(
  row: ValidatedImportRow,
  candidate: MovieSearchResult,
  exactTitleCount: number,
) {
  const imported = normalizeMovieTitle(row.title);
  const candidateTitles = [candidate.title, candidate.originalTitle]
    .filter((title): title is string => Boolean(title))
    .map(normalizeMovieTitle);
  const exactTitle = candidateTitles.includes(imported);
  const partialTitle = candidateTitles.some(
    (title) => title.includes(imported) || imported.includes(title),
  );
  let score = exactTitle ? 70 : partialTitle ? 40 : 0;
  const year = candidateYear(candidate);

  if (row.releaseYear !== null) {
    score += year === row.releaseYear ? 25 : year === null ? 0 : -20;
  } else if (exactTitle && exactTitleCount === 1) {
    score += 15;
  }

  return Math.max(0, Math.min(100, score));
}

export function classifyMovieMatch(
  row: ValidatedImportRow,
  results: readonly MovieSearchResult[],
): ImportRowMatch {
  if (results.length === 0) {
    return {
      rowId: row.id,
      classification: "no_match",
      candidates: [],
      selectedTmdbId: null,
      message: "No TMDB results matched this title.",
    };
  }

  const exactTitleCount = results.filter((candidate) =>
    titleMatches(row, candidate),
  ).length;
  const candidates: ImportMovieCandidate[] = results
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(row, candidate, exactTitleCount),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
  const best = candidates[0];
  const runnerUp = candidates[1];
  const bestYear = candidateYear(best);
  const exact =
    titleMatches(row, best) &&
    row.releaseYear !== null &&
    bestYear === row.releaseYear &&
    !candidates.slice(1).some(
      (candidate) =>
        titleMatches(row, candidate) &&
        candidateYear(candidate) === row.releaseYear,
    );

  if (exact) {
    return {
      rowId: row.id,
      classification: "exact",
      candidates,
      selectedTmdbId: best.tmdbId,
      message: "Title and release year match.",
    };
  }

  const highConfidence =
    best.score >= 85 && (!runnerUp || best.score - runnerUp.score >= 15);

  if (highConfidence) {
    return {
      rowId: row.id,
      classification: "probable",
      candidates,
      selectedTmdbId: best.tmdbId,
      message: "A high-confidence title match was selected.",
    };
  }

  if (best.score < 40) {
    return {
      rowId: row.id,
      classification: "no_match",
      candidates: [],
      selectedTmdbId: null,
      message: "No sufficiently similar TMDB result was found.",
    };
  }

  return {
    rowId: row.id,
    classification: "ambiguous",
    candidates,
    selectedTmdbId: null,
    message: "Choose the correct movie before importing this row.",
  };
}

export async function mapWithConcurrency<T, U>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<U>,
) {
  const results = new Array<U>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), values.length) },
      () => worker(),
    ),
  );
  return results;
}

function providerFailure(row: ValidatedImportRow, error: unknown): ImportRowMatch {
  const message =
    error instanceof MovieProviderRateLimitError ||
    error instanceof MovieProviderTimeoutError ||
    error instanceof MovieProviderError
      ? error.message
      : "TMDB matching failed for this row. Retry it in a moment.";

  return {
    rowId: row.id,
    classification: "error",
    candidates: [],
    selectedTmdbId: null,
    message,
  };
}

export async function matchImportRows(
  rows: readonly ValidatedImportRow[],
  dependencies: ImportMatchingDependencies,
) {
  const session = await dependencies.authenticate();
  if (!session?.userId) {
    throw new AuthenticationRequiredError();
  }

  const eligibleRows = rows.filter(canMatchImportRow);
  const lookupCache = new Map<string, Promise<MovieSearchResult[]>>();

  return mapWithConcurrency(
    eligibleRows,
    MATCH_CONCURRENCY,
    async (row): Promise<ImportRowMatch> => {
      if (row.tmdbId !== null) {
        return {
          rowId: row.id,
          classification: "exact",
          candidates: [
            {
              tmdbId: row.tmdbId,
              title: row.title,
              originalTitle: null,
              overview: null,
              posterPath: null,
              releaseDate: row.releaseYear ? `${row.releaseYear}-01-01` : null,
              voteAverage: null,
              score: 100,
            },
          ],
          selectedTmdbId: row.tmdbId,
          message: "Matched by TMDB movie ID.",
        };
      }

      const cacheKey = movieTitleKey(row.title);
      let lookup = lookupCache.get(cacheKey);

      if (!lookup) {
        lookup = dependencies.searchMovies(session, row.title);
        lookupCache.set(cacheKey, lookup);
      }

      try {
        return classifyMovieMatch(row, await lookup);
      } catch (error) {
        return providerFailure(row, error);
      }
    },
  );
}
