import {
  AdultMovieExcludedError,
  MovieProviderError,
} from "./errors";
import type {
  MovieCastMember,
  MovieDetails,
  MovieSearchResult,
  MovieTrailer,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asPositiveInteger(value: unknown) {
  const number = asNumber(value);
  return number !== null && Number.isSafeInteger(number) && number > 0
    ? number
    : null;
}

function asDate(value: unknown) {
  const date = asString(value);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function mapVoteAverage(record: UnknownRecord) {
  const average = asNumber(record.vote_average);
  const count = asNumber(record.vote_count);

  if (average === null || average <= 0 || count === 0) {
    return null;
  }

  return Math.min(10, Math.max(0, average));
}

function mapSummary(
  record: UnknownRecord,
  includeAdult = false,
): MovieSearchResult | null {
  const tmdbId = asPositiveInteger(record.id);

  if (!tmdbId || (!includeAdult && record.adult === true)) {
    return null;
  }

  const originalTitle = asString(record.original_title);
  const title = asString(record.title) ?? originalTitle ?? "Untitled movie";

  return {
    tmdbId,
    title,
    originalTitle: originalTitle && originalTitle !== title ? originalTitle : null,
    overview: asString(record.overview),
    posterPath: asString(record.poster_path),
    releaseDate: asDate(record.release_date),
    voteAverage: mapVoteAverage(record),
  };
}

function mapGenres(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((genre) => (isRecord(genre) ? asString(genre.name) : null))
    .filter((genre): genre is string => Boolean(genre));
}

function mapProductionCountries(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((country) => {
      if (!isRecord(country)) {
        return null;
      }

      return asString(country.name) ?? asString(country.iso_3166_1);
    })
    .filter((country): country is string => Boolean(country));
}

function mapDirector(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.crew)) {
    return null;
  }

  const director = value.crew.find(
    (member) => isRecord(member) && member.job === "Director",
  );

  return isRecord(director) ? asString(director.name) : null;
}

function mapCast(value: unknown): MovieCastMember[] {
  if (!isRecord(value) || !Array.isArray(value.cast)) {
    return [];
  }

  return value.cast
    .filter(isRecord)
    .filter((member) => member.known_for_department !== "Directing")
    .sort(
      (left, right) =>
        (asNumber(left.order) ?? Number.MAX_SAFE_INTEGER) -
        (asNumber(right.order) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((member) => ({
      name: asString(member.name),
      character: asString(member.character),
    }))
    .filter(
      (member): member is MovieCastMember => member.name !== null,
    )
    .slice(0, 5);
}

function mapTrailer(value: unknown): MovieTrailer | null {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    return null;
  }

  const trailers = value.results
    .filter(isRecord)
    .filter(
      (video) =>
        video.site === "YouTube" &&
        (video.type === "Trailer" || video.type === "Teaser") &&
        Boolean(asString(video.key)),
    )
    .sort((left, right) => {
      const leftScore =
        (left.official === true ? 2 : 0) + (left.type === "Trailer" ? 1 : 0);
      const rightScore =
        (right.official === true ? 2 : 0) + (right.type === "Trailer" ? 1 : 0);
      return rightScore - leftScore;
    });
  const trailer = trailers[0];

  if (!trailer) {
    return null;
  }

  return {
    key: asString(trailer.key)!,
    name: asString(trailer.name) ?? "Official trailer",
    site: "YouTube",
  };
}

export function mapTmdbSearchResponse(
  payload: unknown,
  options: { includeAdult?: boolean } = {},
): MovieSearchResult[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new MovieProviderError("The movie service returned an invalid response.");
  }

  return payload.results
    .map((result) =>
      isRecord(result) ? mapSummary(result, options.includeAdult) : null,
    )
    .filter((movie): movie is MovieSearchResult => Boolean(movie));
}

export function mapTmdbMovieDetails(
  payload: unknown,
  options: { includeAdult?: boolean } = {},
): MovieDetails {
  if (!isRecord(payload)) {
    throw new MovieProviderError("The movie service returned an invalid response.");
  }

  if (payload.adult === true && !options.includeAdult) {
    throw new AdultMovieExcludedError();
  }

  const summary = mapSummary(payload, options.includeAdult);

  if (!summary) {
    throw new MovieProviderError("The movie service returned incomplete movie data.");
  }

  const runtime = asNumber(payload.runtime);

  return {
    ...summary,
    adult: typeof payload.adult === "boolean" ? payload.adult : null,
    backdropPath: asString(payload.backdrop_path),
    runtimeMinutes:
      runtime !== null && Number.isSafeInteger(runtime) && runtime > 0
        ? runtime
        : null,
    genres: mapGenres(payload.genres),
    director: mapDirector(payload.credits),
    cast: mapCast(payload.credits),
    originalLanguage: asString(payload.original_language),
    productionCountries: mapProductionCountries(payload.production_countries),
    trailer: mapTrailer(payload.videos),
  };
}
