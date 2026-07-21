import type {
  LibraryMovie,
  LibraryMovieStatus,
  MovieCastMember,
  MovieDetails,
  MovieTrailer,
} from "../movies/types";
import { LIBRARY_MOVIE_STATUSES } from "../movies/types";

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

function asInteger(value: unknown) {
  const number = asNumber(value);
  return number !== null && Number.isSafeInteger(number) ? number : null;
}

function asStatus(value: unknown): LibraryMovieStatus {
  return typeof value === "string" &&
    LIBRARY_MOVIE_STATUSES.includes(value as LibraryMovieStatus)
    ? (value as LibraryMovieStatus)
    : "want_to_watch";
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
  const runtime = asNumber(record.runtime_minutes);
  const rating = asNumber(record.public_rating);
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
    cast: mapCast(record.main_cast),
    originalLanguage: asString(record.original_language),
    productionCountries: mapStringArray(record.production_countries),
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
    status: asStatus(value.status),
    addedAt: asString(value.created_at ?? value.added_at),
    updatedAt: asString(value.updated_at),
    personalRating: asNumber(value.personal_rating),
    review: asString(value.review),
    priority: asInteger(value.priority) ?? 0,
    queuePosition: asInteger(value.queue_position),
    scheduledFor: asString(value.scheduled_for),
    scheduleTimezone: asString(value.schedule_timezone),
    scheduleNote: asString(value.schedule_note),
    watchedAt: asString(value.watched_at),
    wouldWatchAgain: value.would_watch_again === true,
    movie,
  };
}

export function toSharedMovieRow(movie: MovieDetails) {
  const releaseYear = movie.releaseDate
    ? Number.parseInt(movie.releaseDate.slice(0, 4), 10)
    : null;

  return {
    tmdb_id: movie.tmdbId,
    title: movie.title,
    original_title: movie.originalTitle,
    overview: movie.overview,
    poster_path: movie.posterPath,
    backdrop_path: movie.backdropPath,
    release_date: movie.releaseDate,
    release_year: Number.isSafeInteger(releaseYear) ? releaseYear : null,
    runtime_minutes: movie.runtimeMinutes,
    genres: movie.genres,
    director: movie.director,
    main_cast: movie.cast,
    original_language: movie.originalLanguage,
    production_countries: movie.productionCountries,
    public_rating: movie.voteAverage,
    trailer_key: movie.trailer?.key ?? null,
    metadata_updated_at: new Date().toISOString(),
  };
}

export function isDatabaseIdentifier(value: string) {
  return /^[a-zA-Z0-9-]{1,64}$/.test(value);
}
