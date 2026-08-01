import { AuthenticationRequiredError, LibraryValidationError } from "../library/errors";
import type { SharedMovieReference } from "../movies/shared-metadata";
import { validateTmdbId } from "../movies/validation";
import { canMatchImportRow } from "./mapping";
import type {
  ImportBatchResult,
  ImportDecision,
  ImportRowResult,
  ImportRowResultStatus,
  ValidatedImportRow,
} from "./types";
import type { ImportAuthentication } from "./matching";

export type ConfirmedImportMovie = {
  row: ValidatedImportRow;
  tmdbId: number;
  status: NonNullable<ValidatedImportRow["status"]>;
};

export type ImportInsertResult =
  | { status: "imported"; matchedTitle: string }
  | { status: "already_in_library"; matchedTitle: string };

export interface MovieImportDependencies {
  authenticate(): Promise<ImportAuthentication | null>;
  findOwnedMovie(
    session: ImportAuthentication,
    tmdbId: number,
  ): Promise<{ matchedTitle: string } | null>;
  resolveSharedMovie(
    session: ImportAuthentication,
    tmdbId: number,
  ): Promise<SharedMovieReference>;
  saveMovie(
    session: ImportAuthentication,
    movie: SharedMovieReference,
    row: ConfirmedImportMovie,
    queuePosition: number | null,
  ): Promise<ImportInsertResult>;
  getNextQueuePosition(session: ImportAuthentication): Promise<number>;
  normalizeQueue(session: ImportAuthentication): Promise<void>;
}

function decisionMap(decisions: readonly ImportDecision[]) {
  const result = new Map<string, ImportDecision>();
  for (const decision of decisions) {
    if (result.has(decision.rowId)) {
      throw new LibraryValidationError("An import row was submitted more than once.");
    }
    result.set(decision.rowId, decision);
  }
  return result;
}

function passiveResult(
  row: ValidatedImportRow,
  status: ImportRowResultStatus,
  message: string,
): ImportRowResult {
  return {
    rowId: row.id,
    rowNumber: row.rowNumber,
    importedTitle: row.title || "Untitled row",
    matchedTitle: null,
    status,
    message,
  };
}

function summarize(
  rows: readonly ImportRowResult[],
  warnings: readonly string[] = [],
): ImportBatchResult {
  return {
    summary: {
      total: rows.length,
      imported: rows.filter((row) => row.status === "imported").length,
      alreadyInLibrary: rows.filter(
        (row) => row.status === "already_in_library",
      ).length,
      skipped: rows.filter((row) => row.status === "skipped").length,
      invalid: rows.filter((row) => row.status === "invalid").length,
      unmatched: rows.filter((row) => row.status === "unmatched").length,
      failed: rows.filter((row) => row.status === "failed").length,
    },
    rows: [...rows].sort((left, right) => left.rowNumber - right.rowNumber),
    warnings: [...warnings],
  };
}

export async function importConfirmedMovies(
  rows: readonly ValidatedImportRow[],
  decisions: readonly ImportDecision[],
  dependencies: MovieImportDependencies,
): Promise<ImportBatchResult> {
  const session = await dependencies.authenticate();
  if (!session?.userId) {
    throw new AuthenticationRequiredError();
  }

  const byRow = decisionMap(decisions);
  const results: ImportRowResult[] = [];
  const confirmed: ConfirmedImportMovie[] = [];

  for (const row of rows) {
    if (!canMatchImportRow(row)) {
      const duplicate = row.issues.some(
        (issue) => issue.code === "duplicate_csv_row",
      );
      results.push(
        passiveResult(
          row,
          duplicate ? "skipped" : "invalid",
          row.issues.map((issue) => issue.message).join(" "),
        ),
      );
      continue;
    }

    const decision = byRow.get(row.id);
    if (!decision || decision.disposition === "skip") {
      results.push(passiveResult(row, "skipped", "Skipped by user."));
      continue;
    }

    if (decision.disposition === "unmatched") {
      results.push(
        passiveResult(row, "unmatched", "No TMDB movie was selected."),
      );
      continue;
    }

    if (row.status === null && row.importedStatus && !decision.acceptDefaultStatus) {
      results.push(
        passiveResult(
          row,
          "invalid",
          "The imported status was not confirmed.",
        ),
      );
      continue;
    }

    try {
      if (decision.tmdbId === null) {
        throw new LibraryValidationError("Choose a valid TMDB movie.");
      }

      confirmed.push({
        row,
        tmdbId: validateTmdbId(decision.tmdbId),
        status: row.status ?? "want_to_watch",
      });
    } catch {
      results.push(
        passiveResult(row, "invalid", "Choose a valid TMDB movie."),
      );
    }
  }

  let queuePosition = 1;
  let queueAvailable = true;
  if (confirmed.some((item) => item.status === "watch_next")) {
    try {
      queuePosition = await dependencies.getNextQueuePosition(session);
    } catch {
      queueAvailable = false;
    }
  }
  let queueChanged = false;
  const warnings: string[] = [];
  const sharedMovieCache = new Map<number, Promise<SharedMovieReference>>();

  for (const item of confirmed) {
    if (item.status === "watch_next" && !queueAvailable) {
      results.push(
        passiveResult(
          item.row,
          "failed",
          "The Watch Next position could not be assigned. Retry this row later.",
        ),
      );
      continue;
    }

    const assignedQueuePosition =
      item.status === "watch_next" ? queuePosition : null;

    try {
      const ownedMovie = await dependencies.findOwnedMovie(
        session,
        item.tmdbId,
      );
      if (ownedMovie) {
        results.push({
          rowId: item.row.id,
          rowNumber: item.row.rowNumber,
          importedTitle: item.row.title,
          matchedTitle: ownedMovie.matchedTitle,
          status: "already_in_library",
          message: "Already in library.",
        });
        continue;
      }

      let sharedMovie = sharedMovieCache.get(item.tmdbId);
      if (!sharedMovie) {
        sharedMovie = dependencies.resolveSharedMovie(session, item.tmdbId);
        sharedMovieCache.set(item.tmdbId, sharedMovie);
      }
      const saved = await dependencies.saveMovie(
        session,
        await sharedMovie,
        item,
        assignedQueuePosition,
      );
      results.push({
        rowId: item.row.id,
        rowNumber: item.row.rowNumber,
        importedTitle: item.row.title,
        matchedTitle: saved.matchedTitle,
        status: saved.status,
        message:
          saved.status === "imported"
            ? "Imported successfully."
            : "Already in library.",
      });

      if (saved.status === "imported" && item.status === "watch_next") {
        queuePosition += 1;
        queueChanged = true;
      }
    } catch {
      results.push(
        passiveResult(
          item.row,
          "failed",
          "This movie could not be imported. Retry it later.",
        ),
      );
    }
  }

  if (queueChanged) {
    try {
      await dependencies.normalizeQueue(session);
    } catch {
      // The rows are saved; return a safe batch warning without exposing details.
      warnings.push(
        "Movies were imported, but the Watch Next queue could not be normalized.",
      );
    }
  }

  return summarize(results, warnings);
}
