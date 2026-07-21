import type {
  LibraryMovie,
  MovieCastMember,
  MovieDetails,
  MovieTrailer,
} from "../movies/types";

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
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  return null;
}

function mapStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim() || null;
      }

      return isRecord(item) ? asString(item.name) : null;
    })
    .filter((item): item is string => Boolean(item));
}

function mapCast(value: unknown): MovieCastMember[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return { name: item, character: null };
      }

      if (!isRecord(item)) {
        return null;
      }

      const name = asString(item.name);
      return name
        ? { name, character: asString(item.character) }
        : null;
    })
    .filter((item): item is MovieCastMember => Boolean(item));
}

function mapStoredMovie(record: UnknownRecord): (MovieDetails & { id: string }) | null {
  const id = asString(record.id);
  const tmdbId = asNumber(record.tmdb_id);

  if (!id || !tmdbId || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return null;
  }

  const title = asString(record.title) ?? "Untitled movie";
  const originalTitle = asString(record.original_title);
  const runtime = asNumber(record.runtime);
  const rating = asNumber(record.vote_average);
  const trailerKey = asString(record.trailer_key);
  const trailer: MovieTrailer | null = trailerKey
    ? {
        key: trailerKey,
        name: "Official trailer",
        site: "YouTube",
      }
    : null;

  return {
    id,
    tmdbId,
    title,
    originalTitle: originalTitle && originalTitle !== title ? originalTitle : null,
    overview: asString(record.overview),
    posterPath: asString(record.poster_path),
    backdropPath: asString(record.backdrop_path),
    releaseDate: asString(record.release_date),
    voteAverage: rating !== null && rating > 0 ? rating : null,
    runtimeMinutes:
      runtime !== null && Number.isSafeInteger(runtime) && runtime > 0
        ? runtime
        : null,
    genres: mapStringArray(record.genres),
    director: asString(record.director),
    cast: mapCast(record.cast_members ?? record.cast),
    trailer,
  };
}

export function mapLibraryMovieRow(value: unknown): LibraryMovie | null {
  if (!isRecord(value)) {
    return null;
  }

  const libraryId = asString(value.id);
  const relatedMovie = Array.isArray(value.movies) ? value.movies[0] : value.movies;
  const movie = isRecord(relatedMovie) ? mapStoredMovie(relatedMovie) : null;

  if (!libraryId || !movie) {
    return null;
  }

  return {
    libraryId,
    status: asString(value.status) ?? "want_to_watch",
    addedAt: asString(value.created_at ?? value.added_at),
    movie,
  };
}

export function toSharedMovieRow(movie: MovieDetails) {
  return {
    tmdb_id: movie.tmdbId,
    title: movie.title,
    original_title: movie.originalTitle,
    overview: movie.overview,
    poster_path: movie.posterPath,
    backdrop_path: movie.backdropPath,
    release_date: movie.releaseDate,
    runtime: movie.runtimeMinutes,
    genres: movie.genres,
    director: movie.director,
    cast_members: movie.cast,
    trailer_key: movie.trailer?.key ?? null,
    vote_average: movie.voteAverage,
  };
}

export function isDatabaseIdentifier(value: string) {
  return /^[a-zA-Z0-9-]{1,64}$/.test(value);
}
