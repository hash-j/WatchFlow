import type { LibraryMovieStatus } from "../movies/types";
import {
  IMPORT_FIELDS,
  type ColumnMapping,
  type CsvColumn,
  type ImportField,
  type ImportRowIssue,
  type ParsedCsv,
  type ValidatedImportRow,
} from "./types";
import { movieTitleKey } from "./title-normalization";

const CURRENT_YEAR = new Date().getUTCFullYear();
const MIN_RELEASE_YEAR = 1888;
const MAX_RELEASE_YEAR = CURRENT_YEAR + 5;
const MAX_REVIEW_LENGTH = 5_000;

const HEADER_ALIASES: Record<ImportField, readonly string[]> = {
  title: ["moviename", "movie", "title", "name", "movietitle"],
  releaseYear: ["releaseyear", "year", "released"],
  director: ["director", "directedby"],
  cast: ["cast", "actors", "actor", "starring"],
  genres: ["genre", "genres", "type"],
  personalRating: ["personalrating", "myrating", "userrating"],
  status: ["status", "watchstatus", "state", "watched"],
  watchedDate: ["watcheddate", "datewatched", "completeddate"],
  review: ["review", "notes", "note", "comments"],
  priority: ["priority"],
};

const STATUS_ALIASES: Record<string, LibraryMovieStatus> = {
  wanttowatch: "want_to_watch",
  unwatched: "want_to_watch",
  pending: "want_to_watch",
  watchnext: "watch_next",
  next: "watch_next",
  watching: "currently_watching",
  currentlywatching: "currently_watching",
  watched: "watched",
  complete: "watched",
  completed: "watched",
  yes: "watched",
  onhold: "on_hold",
  paused: "on_hold",
  dropped: "dropped",
  abandoned: "dropped",
};

export class ImportMappingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportMappingValidationError";
  }
}

export function normalizeHeader(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function suggestColumnMappings(columns: readonly CsvColumn[]) {
  const suggestions: ColumnMapping = {};
  const usedColumns = new Set<string>();

  for (const field of IMPORT_FIELDS) {
    const aliases = HEADER_ALIASES[field];
    const column = columns.find(
      (candidate) =>
        !usedColumns.has(candidate.id) &&
        aliases.includes(normalizeHeader(candidate.header)),
    );

    if (column) {
      suggestions[field] = column.id;
      usedColumns.add(column.id);
    }
  }

  return suggestions;
}

export function validateColumnMapping(
  mapping: ColumnMapping,
  columns: readonly CsvColumn[],
) {
  const knownColumns = new Set(columns.map((column) => column.id));
  const mappedColumns: string[] = [];

  for (const field of IMPORT_FIELDS) {
    const columnId = mapping[field];

    if (!columnId) {
      continue;
    }

    if (!knownColumns.has(columnId)) {
      throw new ImportMappingValidationError(
        "The column mapping contains an unknown CSV column.",
      );
    }

    mappedColumns.push(columnId);
  }

  if (!mapping.title) {
    throw new ImportMappingValidationError(
      "Map one CSV column to Movie title before continuing.",
    );
  }

  if (new Set(mappedColumns).size !== mappedColumns.length) {
    throw new ImportMappingValidationError(
      "Each CSV column can map to only one WatchFlow field.",
    );
  }
}

function splitList(value: string) {
  return value
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseReleaseYear(value: string, issues: ImportRowIssue[]) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}$/.test(value)) {
    issues.push({
      code: "invalid_year",
      message: "Release year must be a four-digit year.",
      severity: "error",
    });
    return null;
  }

  const year = Number(value);
  if (year < MIN_RELEASE_YEAR || year > MAX_RELEASE_YEAR) {
    issues.push({
      code: "invalid_year",
      message: `Release year must be between ${MIN_RELEASE_YEAR} and ${MAX_RELEASE_YEAR}.`,
      severity: "error",
    });
    return null;
  }

  return year;
}

function parsePersonalRating(value: string, issues: ImportRowIssue[]) {
  if (!value) {
    return null;
  }

  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
    issues.push({
      code: "invalid_rating",
      message: "Personal rating must be between 0 and 10.",
      severity: "error",
    });
    return null;
  }

  return rating;
}

function parsePriority(value: string, issues: ImportRowIssue[]) {
  if (!value) {
    return 0;
  }

  const priority = Number(value);
  if (!Number.isSafeInteger(priority) || priority < 0 || priority > 5) {
    issues.push({
      code: "invalid_priority",
      message: "Priority must be a whole number from 0 to 5.",
      severity: "error",
    });
    return 0;
  }

  return priority;
}

function isRealDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseWatchedDate(value: string) {
  if (!value) {
    return { watchedAt: null, interpretation: null, error: null };
  }

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    if (isRealDate(Number(year), Number(month), Number(day))) {
      return {
        watchedAt: `${year}-${month}-${day}T00:00:00.000Z`,
        interpretation: `${year}-${month}-${day} (calendar date)`,
        error: null,
      };
    }
  }

  const slashDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (slashDate) {
    const first = Number(slashDate[1]);
    const second = Number(slashDate[2]);
    const year = Number(slashDate[3]);
    let month: number | null = null;
    let day: number | null = null;

    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      month = first;
      day = second;
    } else if (first === second) {
      month = first;
      day = second;
    } else {
      return {
        watchedAt: null,
        interpretation: null,
        error: "The watched date is ambiguous. Use YYYY-MM-DD.",
      };
    }

    if (month && day && isRealDate(year, month, day)) {
      const normalized = `${year.toString().padStart(4, "0")}-${month
        .toString()
        .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
      return {
        watchedAt: `${normalized}T00:00:00.000Z`,
        interpretation: `${normalized} (calendar date)`,
        error: null,
      };
    }
  }

  return {
    watchedAt: null,
    interpretation: null,
    error: "Use a valid, unambiguous watched date such as YYYY-MM-DD.",
  };
}

export function mapImportedStatus(value: string) {
  return value ? (STATUS_ALIASES[normalizeHeader(value)] ?? null) : null;
}

function valueFor(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  rowIndex: number,
  field: ImportField,
) {
  const columnId = mapping[field];
  return columnId ? (parsed.rows[rowIndex].values[columnId] ?? "").trim() : "";
}

export function validateAndMapRows(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
): ValidatedImportRow[] {
  validateColumnMapping(mapping, parsed.columns);
  const duplicateKeys = new Set<string>();

  return parsed.rows.map((row, sourceOrder) => {
    const issues: ImportRowIssue[] = [];
    const title = valueFor(parsed, mapping, sourceOrder, "title");
    const releaseYear = parseReleaseYear(
      valueFor(parsed, mapping, sourceOrder, "releaseYear"),
      issues,
    );
    const rating = parsePersonalRating(
      valueFor(parsed, mapping, sourceOrder, "personalRating"),
      issues,
    );
    const priority = parsePriority(
      valueFor(parsed, mapping, sourceOrder, "priority"),
      issues,
    );
    const importedStatus =
      valueFor(parsed, mapping, sourceOrder, "status") || null;
    const status = importedStatus ? mapImportedStatus(importedStatus) : null;
    const watchedDate = parseWatchedDate(
      valueFor(parsed, mapping, sourceOrder, "watchedDate"),
    );

    if (!title) {
      issues.push({
        code: "missing_title",
        message: "Movie title is required.",
        severity: "error",
      });
    }

    if (importedStatus && !status) {
      issues.push({
        code: "unknown_status",
        message: `Review the unrecognized status “${importedStatus}”.`,
        severity: "review",
      });
    }

    if (watchedDate.error) {
      issues.push({
        code: "invalid_watched_date",
        message: watchedDate.error,
        severity: "error",
      });
    }

    const duplicateKey = `${movieTitleKey(title)}::${releaseYear ?? ""}`;
    if (title && duplicateKeys.has(duplicateKey)) {
      issues.push({
        code: "duplicate_csv_row",
        message: "This title and release year already appear in the CSV.",
        severity: "error",
      });
    } else if (title) {
      duplicateKeys.add(duplicateKey);
    }

    const review = valueFor(parsed, mapping, sourceOrder, "review");
    if (review.length > MAX_REVIEW_LENGTH) {
      issues.push({
        code: "invalid_review",
        message: `Review must be ${MAX_REVIEW_LENGTH} characters or fewer.`,
        severity: "error",
      });
    }

    return {
      id: row.id,
      rowNumber: row.rowNumber,
      sourceOrder,
      title,
      releaseYear,
      director:
        valueFor(parsed, mapping, sourceOrder, "director") || null,
      cast: splitList(valueFor(parsed, mapping, sourceOrder, "cast")),
      genres: splitList(valueFor(parsed, mapping, sourceOrder, "genres")),
      personalRating: rating,
      status,
      importedStatus,
      watchedAt: watchedDate.watchedAt,
      watchedDateInterpretation: watchedDate.interpretation,
      review: review.slice(0, MAX_REVIEW_LENGTH) || null,
      priority,
      issues,
    };
  });
}

export function canMatchImportRow(row: ValidatedImportRow) {
  return !row.issues.some((issue) => issue.severity === "error");
}
