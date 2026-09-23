import type {
  LibraryMovieStatus,
  MovieSearchResult,
} from "../movies/types";

export const CSV_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_IMPORT_MAX_ROWS = 500;
export const CSV_IMPORT_MAX_COLUMNS = 100;
export const CSV_IMPORT_MAX_CELL_CHARACTERS = 10_000;
export const CSV_IMPORT_PREVIEW_ROWS = 20;
export const CSV_IMPORT_CHUNK_SIZE = 20;

export const IMPORT_FIELDS = [
  "title",
  "tmdbId",
  "releaseYear",
  "director",
  "cast",
  "genres",
  "personalRating",
  "status",
  "watchedDate",
  "review",
  "priority",
  "favourite",
  "wouldWatchAgain",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  title: "Movie title",
  tmdbId: "TMDB movie ID",
  releaseYear: "Release year",
  director: "Director",
  cast: "Cast",
  genres: "Genres",
  personalRating: "Personal rating",
  status: "Status",
  watchedDate: "Watched date",
  review: "Review",
  priority: "Priority",
  favourite: "Favourite",
  wouldWatchAgain: "Would watch again",
};

export type CsvColumn = {
  id: string;
  header: string;
  index: number;
};

export type CsvRawRow = {
  id: string;
  rowNumber: number;
  values: Record<string, string>;
};

export type ParsedCsv = {
  fileName: string;
  columns: CsvColumn[];
  rows: CsvRawRow[];
  warnings: string[];
};

export type ColumnMapping = Partial<Record<ImportField, string>>;

export type ImportRowIssueCode =
  | "missing_title"
  | "invalid_tmdb_id"
  | "invalid_year"
  | "invalid_rating"
  | "invalid_watched_date"
  | "invalid_priority"
  | "invalid_review"
  | "invalid_favourite"
  | "invalid_watch_again"
  | "unknown_status"
  | "duplicate_csv_row";

export type ImportRowIssue = {
  code: ImportRowIssueCode;
  message: string;
  severity: "error" | "review";
};

export type ValidatedImportRow = {
  id: string;
  rowNumber: number;
  sourceOrder: number;
  title: string;
  tmdbId: number | null;
  releaseYear: number | null;
  director: string | null;
  cast: string[];
  genres: string[];
  personalRating: number | null;
  status: LibraryMovieStatus | null;
  importedStatus: string | null;
  watchedAt: string | null;
  watchedDateInterpretation: string | null;
  review: string | null;
  priority: number;
  favourite: boolean;
  wouldWatchAgain: boolean;
  suppliedFields: ImportField[];
  issues: ImportRowIssue[];
};

export type ImportMatchClassification =
  | "exact"
  | "probable"
  | "ambiguous"
  | "no_match"
  | "error";

export type ImportMovieCandidate = MovieSearchResult & {
  score: number;
};

export type ImportRowMatch = {
  rowId: string;
  classification: ImportMatchClassification;
  candidates: ImportMovieCandidate[];
  selectedTmdbId: number | null;
  message: string;
};

export type ImportDecision = {
  rowId: string;
  disposition: "import" | "skip" | "unmatched";
  tmdbId: number | null;
  acceptDefaultStatus: boolean;
  skipReason?: "user" | "duplicate";
};

export type ImportRowResultStatus =
  | "added"
  | "updated"
  | "skipped"
  | "invalid"
  | "unmatched"
  | "failed";

export type ImportRowResult = {
  rowId: string;
  rowNumber: number;
  importedTitle: string;
  matchedTitle: string | null;
  status: ImportRowResultStatus;
  message: string;
};

export type ImportResultSummary = {
  total: number;
  added: number;
  updated: number;
  skipped: number;
  invalid: number;
  unmatched: number;
  failed: number;
};

export type ImportBatchResult = {
  summary: ImportResultSummary;
  rows: ImportRowResult[];
  warnings: string[];
};

export type ImportActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };
