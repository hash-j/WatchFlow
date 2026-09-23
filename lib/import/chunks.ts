import {
  CSV_IMPORT_CHUNK_SIZE,
  type ImportBatchResult,
  type ImportResultSummary,
} from "./types";

export function chunkImportValues<T>(
  values: readonly T[],
  size = CSV_IMPORT_CHUNK_SIZE,
) {
  if (!Number.isSafeInteger(size) || size < 1 || size > CSV_IMPORT_CHUNK_SIZE) {
    throw new Error("Invalid CSV import chunk size.");
  }

  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function summarizeImportResults(
  rows: readonly ImportBatchResult["rows"][number][],
): ImportResultSummary {
  return {
    total: rows.length,
    added: rows.filter((row) => row.status === "added").length,
    updated: rows.filter((row) => row.status === "updated").length,
    skipped: rows.filter((row) => row.status === "skipped").length,
    invalid: rows.filter((row) => row.status === "invalid").length,
    unmatched: rows.filter((row) => row.status === "unmatched").length,
    failed: rows.filter((row) => row.status === "failed").length,
  };
}

export function mergeImportBatchResults(
  batches: readonly ImportBatchResult[],
): ImportBatchResult {
  const rows = batches
    .flatMap((batch) => batch.rows)
    .sort((left, right) => left.rowNumber - right.rowNumber);
  return {
    summary: summarizeImportResults(rows),
    rows,
    warnings: [...new Set(batches.flatMap((batch) => batch.warnings))],
  };
}
