import { describe, expect, it } from "vitest";

import {
  chunkImportValues,
  mergeImportBatchResults,
  summarizeImportResults,
} from "./chunks";
import { CSV_IMPORT_CHUNK_SIZE, type ImportRowResult } from "./types";

function result(index: number, status: ImportRowResult["status"]): ImportRowResult {
  return {
    rowId: `row_${index}`,
    rowNumber: index + 1,
    importedTitle: `Movie ${index}`,
    matchedTitle: null,
    status,
    message: status,
  };
}

describe("CSV Import V2 chunks", () => {
  it("divides 100+ rows into bounded requests", () => {
    const chunks = chunkImportValues(Array.from({ length: 143 }, (_, i) => i));
    expect(chunks).toHaveLength(Math.ceil(143 / CSV_IMPORT_CHUNK_SIZE));
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBe(
      CSV_IMPORT_CHUNK_SIZE,
    );
  });

  it("completes a 150-row logical workflow with consistent counters", () => {
    const chunks = chunkImportValues(Array.from({ length: 150 }, (_, i) => i));
    const batches = chunks.map((chunk) => {
      const rows = chunk.map((index) =>
        result(index + 1, index % 3 === 0 ? "updated" : "added"),
      );
      return { summary: summarizeImportResults(rows), rows, warnings: [] };
    });
    const merged = mergeImportBatchResults(batches);
    expect(chunks).toHaveLength(8);
    expect(merged.summary.total).toBe(150);
    expect(merged.summary.added + merged.summary.updated).toBe(150);
    expect(merged.rows).toHaveLength(150);
  });

  it("keeps skipped and failed progress counters internally consistent", () => {
    const rows = [result(1, "added"), result(2, "updated"), result(3, "skipped"), result(4, "failed")];
    const summary = summarizeImportResults(rows);
    expect(summary).toMatchObject({ total: 4, added: 1, updated: 1, skipped: 1, failed: 1 });
  });
});
