import { mapProfileSettings, mapUserPreferences } from "./mapping";
import {
  escapeCsvCell,
  neutralizeSpreadsheetFormula,
} from "@/lib/csv/safety";

export { escapeCsvCell, neutralizeSpreadsheetFormula };

type UnknownRecord = Record<string, unknown>;

export const CSV_EXPORT_HEADERS = [
  "Title",
  "Original Title",
  "Release Year",
  "Director",
  "Cast",
  "Genres",
  "Public Rating",
  "Personal Rating",
  "Status",
  "Favourite",
  "Priority",
  "Review",
  "Watched Date",
  "Scheduled Date",
  "Schedule Timezone",
  "Would Watch Again",
  "Date Added",
  "TMDB ID",
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function movieRecord(value: unknown) {
  if (Array.isArray(value)) return isRecord(value[0]) ? value[0] : {};
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function nullableString(value: unknown) {
  const result = stringValue(value);
  return result || null;
}

function names(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      return isRecord(item) ? stringValue(item.name) : "";
    })
    .filter(Boolean)
    .join(" | ");
}

function releaseYear(movie: UnknownRecord) {
  const stored = stringValue(movie.release_year);
  if (stored) return stored;
  const date = stringValue(movie.release_date);
  return /^\d{4}/.test(date) ? date.slice(0, 4) : "";
}

export function buildLibraryCsv(rows: unknown[]) {
  const csvRows = rows.map((value) => {
    const record = isRecord(value) ? value : {};
    const movie = movieRecord(record.movies);
    const values = [
      movie.title,
      movie.original_title,
      releaseYear(movie),
      movie.director,
      names(movie.main_cast),
      names(movie.genres),
      movie.public_rating,
      record.personal_rating,
      record.status,
      record.favourite === true ? "Yes" : "No",
      record.priority,
      record.review,
      record.watched_at,
      record.scheduled_for,
      record.schedule_timezone,
      record.would_watch_again === true ? "Yes" : "No",
      record.created_at,
      movie.tmdb_id,
    ];
    return values.map(escapeCsvCell).join(",");
  });

  return [CSV_EXPORT_HEADERS.map(escapeCsvCell).join(","), ...csvRows].join(
    "\r\n",
  );
}

function mapMovieMetadata(value: unknown) {
  const movie = movieRecord(value);
  return {
    title: nullableString(movie.title),
    originalTitle: nullableString(movie.original_title),
    overview: nullableString(movie.overview),
    releaseDate: nullableString(movie.release_date),
    releaseYear: releaseYear(movie) || null,
    runtimeMinutes:
      typeof movie.runtime_minutes === "number" ? movie.runtime_minutes : null,
    genres: Array.isArray(movie.genres) ? movie.genres : [],
    director: nullableString(movie.director),
    cast: Array.isArray(movie.main_cast) ? movie.main_cast : [],
    originalLanguage: nullableString(movie.original_language),
    productionCountries: Array.isArray(movie.production_countries)
      ? movie.production_countries
      : [],
    publicRating:
      typeof movie.public_rating === "number" ? movie.public_rating : null,
    tmdbId:
      typeof movie.tmdb_id === "number" || typeof movie.tmdb_id === "string"
        ? movie.tmdb_id
        : null,
  };
}

function mapPersonalMovie(value: unknown) {
  const record = isRecord(value) ? value : {};
  return {
    movie: mapMovieMetadata(record.movies),
    status: nullableString(record.status),
    favourite: record.favourite === true,
    personalRating:
      typeof record.personal_rating === "number" ? record.personal_rating : null,
    review: nullableString(record.review),
    priority: typeof record.priority === "number" ? record.priority : 0,
    queuePosition:
      typeof record.queue_position === "number" ? record.queue_position : null,
    scheduledFor: nullableString(record.scheduled_for),
    scheduleTimezone: nullableString(record.schedule_timezone),
    scheduleNote: nullableString(record.schedule_note),
    watchedAt: nullableString(record.watched_at),
    wouldWatchAgain: record.would_watch_again === true,
    dateAdded: nullableString(record.created_at),
    updatedAt: nullableString(record.updated_at),
  };
}

function mapListMembership(value: unknown) {
  const record = isRecord(value) ? value : {};
  const userMovie = movieRecord(record.user_movies);
  const movie = movieRecord(userMovie.movies);

  return {
    position:
      typeof record.position === "number" ? record.position : null,
    title: nullableString(movie.title),
    tmdbId:
      typeof movie.tmdb_id === "number" || typeof movie.tmdb_id === "string"
        ? movie.tmdb_id
        : null,
    addedAt: nullableString(record.created_at),
  };
}

function mapCustomList(value: unknown) {
  const record = isRecord(value) ? value : {};
  const memberships = Array.isArray(record.list_movies)
    ? record.list_movies
        .map(mapListMembership)
        .sort(
          (left, right) =>
            (left.position ?? Number.MAX_SAFE_INTEGER) -
            (right.position ?? Number.MAX_SAFE_INTEGER),
        )
    : [];

  return {
    name: nullableString(record.name),
    description: nullableString(record.description),
    visibility: nullableString(record.visibility) ?? "private",
    createdAt: nullableString(record.created_at),
    updatedAt: nullableString(record.updated_at),
    movies: memberships,
  };
}

export function buildAccountDataExport(input: {
  exportedAt: string;
  email: string | null;
  profile: unknown;
  preferences: unknown;
  library: unknown[];
  lists?: unknown[];
}) {
  const profile = mapProfileSettings(input.profile);
  const preferences = mapUserPreferences(input.preferences);
  const library = input.library.map(mapPersonalMovie);

  return {
    exportedAt: input.exportedAt,
    profile: {
      email: input.email,
      fullName: profile.fullName,
      avatarUrl: profile.avatarUrl,
      country: profile.country || null,
      timezone: profile.timezone,
      createdAt: profile.createdAt,
    },
    preferences,
    library,
    customLists: (input.lists ?? []).map(mapCustomList),
    schedules: library
      .filter((item) => item.scheduledFor)
      .map((item) => ({
        title: item.movie.title,
        tmdbId: item.movie.tmdbId,
        scheduledFor: item.scheduledFor,
        timezone: item.scheduleTimezone,
        note: item.scheduleNote,
      })),
    metadata: { formatVersion: 2 },
  };
}

export function exportFilenameDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
