"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import {
  CsvImportValidationError,
  parseCsvText,
  validateCsvFileMetadata,
  validateParsedCsvPayload,
} from "@/lib/import/csv";
import {
  ImportMappingValidationError,
  validateAndMapRows,
} from "@/lib/import/mapping";
import { matchImportRows } from "@/lib/import/matching";
import { importConfirmedMovies } from "@/lib/import/service";
import { createImportMatchingDependencies, createMovieImportDependencies } from "@/lib/import/supabase-import";
import {
  IMPORT_FIELDS,
  type ColumnMapping,
  type ImportActionResult,
  type ImportBatchResult,
  type ImportDecision,
  type ImportField,
  type ImportRowMatch,
  type ParsedCsv,
} from "@/lib/import/types";
import {
  AuthenticationRequiredError,
  LibraryValidationError,
} from "@/lib/library/errors";
import { createClient } from "@/lib/supabase/server";

async function isAuthenticated() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return !error && Boolean(user);
}

function friendlyImportError(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return "Your session has expired. Sign in again before importing movies.";
  }

  if (
    error instanceof CsvImportValidationError ||
    error instanceof ImportMappingValidationError ||
    error instanceof LibraryValidationError
  ) {
    return error.message;
  }

  return "WatchFlow could not complete that import step. Please try again.";
}

function mappingFromUnknown(value: unknown): ColumnMapping {
  if (typeof value !== "object" || value === null) {
    throw new ImportMappingValidationError("Choose a valid column mapping.");
  }

  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    IMPORT_FIELDS.flatMap((field) => {
      const column = source[field];
      return typeof column === "string" && column ? [[field, column]] : [];
    }),
  ) as Partial<Record<ImportField, string>>;
}

function decisionsFromUnknown(value: unknown): ImportDecision[] {
  if (!Array.isArray(value) || value.length > 500) {
    throw new LibraryValidationError("The import decisions are invalid.");
  }

  return value.map((decision) => {
    if (
      typeof decision !== "object" ||
      decision === null ||
      !("rowId" in decision) ||
      typeof decision.rowId !== "string" ||
      !("disposition" in decision) ||
      !["import", "skip", "unmatched"].includes(String(decision.disposition))
    ) {
      throw new LibraryValidationError("An import decision is invalid.");
    }

    return {
      rowId: decision.rowId,
      disposition: decision.disposition as ImportDecision["disposition"],
      tmdbId:
        "tmdbId" in decision && typeof decision.tmdbId === "number"
          ? decision.tmdbId
          : null,
      acceptDefaultStatus:
        "acceptDefaultStatus" in decision &&
        decision.acceptDefaultStatus === true,
    };
  });
}

function rowIdsFromUnknown(value: unknown) {
  if (!Array.isArray(value) || value.length > 500) {
    throw new LibraryValidationError("The selected import rows are invalid.");
  }

  const rowIds = value.map((rowId) => {
    if (typeof rowId !== "string" || !/^row_[1-9]\d{0,2}$/.test(rowId)) {
      throw new LibraryValidationError("A selected import row is invalid.");
    }
    return rowId;
  });

  if (new Set(rowIds).size !== rowIds.length) {
    throw new LibraryValidationError(
      "An import row was selected more than once.",
    );
  }

  return new Set(rowIds);
}

export async function parseCsvAction(
  formData: FormData,
): Promise<ImportActionResult<ParsedCsv>> {
  if (!(await isAuthenticated())) {
    return {
      ok: false,
      message: "Your session has expired. Sign in again before importing movies.",
    };
  }

  try {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new CsvImportValidationError("Choose a CSV file to upload.");
    }

    validateCsvFileMetadata(file);
    const parsed = parseCsvText(await file.text(), file.name);
    return { ok: true, data: validateParsedCsvPayload(parsed) };
  } catch (error) {
    return { ok: false, message: friendlyImportError(error) };
  }
}

export async function matchCsvRowsAction(input: {
  parsed: unknown;
  mapping: unknown;
  rowIds: unknown;
}): Promise<ImportActionResult<ImportRowMatch[]>> {
  if (!(await isAuthenticated())) {
    return {
      ok: false,
      message: "Your session has expired. Sign in again before importing movies.",
    };
  }

  try {
    const parsed = validateParsedCsvPayload(input.parsed);
    const mapping = mappingFromUnknown(input.mapping);
    const rows = validateAndMapRows(parsed, mapping);
    const requestedRows = rowIdsFromUnknown(input.rowIds);
    const matches = await matchImportRows(
      rows.filter((row) => requestedRows.has(row.id)),
      createImportMatchingDependencies(),
    );
    return { ok: true, data: matches };
  } catch (error) {
    return { ok: false, message: friendlyImportError(error) };
  }
}

export async function confirmCsvImportAction(input: {
  parsed: unknown;
  mapping: unknown;
  decisions: unknown;
}): Promise<ImportActionResult<ImportBatchResult>> {
  if (!(await isAuthenticated())) {
    return {
      ok: false,
      message: "Your session has expired. Sign in again before importing movies.",
    };
  }

  try {
    const parsed = validateParsedCsvPayload(input.parsed);
    const rows = validateAndMapRows(parsed, mappingFromUnknown(input.mapping));
    const result = await importConfirmedMovies(
      rows,
      decisionsFromUnknown(input.decisions),
      createMovieImportDependencies(),
    );

    revalidatePath("/dashboard");
    revalidatePath("/library", "layout");
    revalidatePath("/watch-next");
    revalidatePath("/schedule");
    revalidatePath("/picker");
    revalidatePath("/recommendations");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, message: friendlyImportError(error) };
  }
}
