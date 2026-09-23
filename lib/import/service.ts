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
import { summarizeImportResults } from "./chunks";

export type ConfirmedImportMovie = {
  row: ValidatedImportRow;
  tmdbId: number;
  status: NonNullable<ValidatedImportRow["status"]>;
};

export type ImportInsertResult =
  | { status: "added"; matchedTitle: string }
  | { status: "skipped"; matchedTitle: string };

export type OwnedImportMovie = {
  id: string;
  matchedTitle: string;
  status: NonNullable<ValidatedImportRow["status"]>;
  favourite: boolean;
  personalRating: number | null;
  review: string | null;
  priority: number;
  watchedAt: string | null;
  wouldWatchAgain: boolean;
  scheduledFor: string | null;
  scheduleTimezone: string | null;
  scheduleNote: string | null;
};

export interface MovieImportDependencies {
  authenticate(): Promise<ImportAuthentication | null>;
  findOwnedMovie(
    session: ImportAuthentication,
    tmdbId: number,
  ): Promise<OwnedImportMovie | null>;
  updateOwnedMovie(
    session: ImportAuthentication,
    owned: OwnedImportMovie,
    row: ConfirmedImportMovie,
  ): Promise<{ status: "updated" | "skipped"; matchedTitle: string }>;
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
      ...summarizeImportResults(rows),
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
  const selectedTmdbIds = new Set<number>();

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
      results.push(
        passiveResult(
          row,
          "skipped",
          decision?.skipReason === "duplicate"
            ? "Another CSV row resolves to the same movie."
            : "Skipped by user.",
        ),
      );
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

      const tmdbId = validateTmdbId(decision.tmdbId);
      if (selectedTmdbIds.has(tmdbId)) {
        results.push(
          passiveResult(
            row,
            "skipped",
            "Another CSV row resolves to the same movie.",
          ),
        );
        continue;
      }
      selectedTmdbIds.add(tmdbId);
      confirmed.push({
        row,
        tmdbId,
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
    try {
      const ownedMovie = await dependencies.findOwnedMovie(
        session,
        item.tmdbId,
      );
      if (ownedMovie) {
        const updated = await dependencies.updateOwnedMovie(
          session,
          ownedMovie,
          item,
        );
        results.push({
          rowId: item.row.id,
          rowNumber: item.row.rowNumber,
          importedTitle: item.row.title,
          matchedTitle: ownedMovie.matchedTitle,
          status: updated.status,
          message:
            updated.status === "updated"
              ? "Library metadata updated."
              : "Already in Library; no user metadata was supplied.",
        });
        continue;
      }

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
          saved.status === "added"
            ? "Added successfully."
            : "Already in Library; no duplicate was created.",
      });

      if (saved.status === "added" && item.status === "watch_next") {
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
