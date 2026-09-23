import { describe, expect, it } from "vitest";

import {
  CsvImportValidationError,
  parseCsvText,
  validateCsvFileMetadata,
  validateParsedCsvChunkPayload,
  validateParsedCsvPayload,
} from "./csv";
import {
  CSV_IMPORT_MAX_CELL_CHARACTERS,
  CSV_IMPORT_MAX_COLUMNS,
} from "./types";

describe("CSV import parsing", () => {
  it("parses a valid CSV", () => {
    const parsed = parseCsvText("Title,Year\nInception,2010", "movies.csv");

    expect(parsed.fileName).toBe("movies.csv");
    expect(parsed.columns.map((column) => column.header)).toEqual([
      "Title",
      "Year",
    ]);
    expect(parsed.rows[0].values).toEqual({
      column_1: "Inception",
      column_2: "2010",
    });
  });

  it("rejects an empty CSV", () => {
    expect(() => parseCsvText("  \n\r\n")).toThrow(
      CsvImportValidationError,
    );
  });

  it("keeps duplicate headers separately and warns the user", () => {
    const parsed = parseCsvText("Title,Title\nInception,Alternate");

    expect(parsed.columns.map((column) => column.id)).toEqual([
      "column_1",
      "column_2",
    ]);
    expect(parsed.warnings[0]).toContain("Duplicate headers");
  });

  it("supports quoted commas", () => {
    const parsed = parseCsvText('Title,Notes\n"Once Upon a Time, in America","Long, epic"');

    expect(parsed.rows[0].values.column_1).toBe(
      "Once Upon a Time, in America",
    );
    expect(parsed.rows[0].values.column_2).toBe("Long, epic");
  });

  it("ignores empty rows", () => {
    const parsed = parseCsvText("Title\nInception\n\n  \nArrival");
    expect(parsed.rows).toHaveLength(2);
  });

  it("rejects invalid file types", () => {
    expect(() =>
      validateCsvFileMetadata({
        name: "movies.xlsx",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 100,
      }),
    ).toThrow(".csv extension");
  });

  it("rejects oversized files", () => {
    expect(() =>
      validateCsvFileMetadata(
        { name: "movies.csv", type: "text/csv", size: 101 },
        100,
      ),
    ).toThrow("smaller");
  });

  it("enforces the row limit", () => {
    const csv = ["Title", "One", "Two", "Three"].join("\n");
    expect(() => parseCsvText(csv, "movies.csv", 2)).toThrow(
      "Import at most 2 rows",
    );
  });

  it("rejects excessive columns during the initial parse", () => {
    const headers = Array.from(
      { length: CSV_IMPORT_MAX_COLUMNS + 1 },
      (_, index) => `Column ${index + 1}`,
    );
    expect(() => parseCsvText(headers.join(","))).toThrow(
      `${CSV_IMPORT_MAX_COLUMNS} columns or fewer`,
    );
  });

  it("rejects oversized cells during the initial parse", () => {
    const oversized = "a".repeat(CSV_IMPORT_MAX_CELL_CHARACTERS + 1);
    expect(() => parseCsvText(`Title\n${oversized}`)).toThrow(
      `${CSV_IMPORT_MAX_CELL_CHARACTERS.toLocaleString()} characters or fewer`,
    );
  });

  it("rejects parsed control-character expansion before returning it to the browser", () => {
    const expandedCell = "\u0001".repeat(1_400);
    const csv = [
      "Title",
      ...Array.from({ length: 500 }, () => expandedCell),
    ].join("\n");
    const parsed = parseCsvText(csv);

    expect(csv.length).toBeLessThan(2 * 1024 * 1024);
    expect(JSON.stringify(parsed).length).toBeGreaterThan(4 * 1024 * 1024);
    expect(() => validateParsedCsvPayload(parsed)).toThrow(
      "temporary CSV data is invalid",
    );
  });

  it("accepts ordered original row IDs in a bounded chunk", () => {
    const parsed = parseCsvText(
      ["Title", ...Array.from({ length: 25 }, (_, index) => `Movie ${index + 1}`)].join("\n"),
    );
    const chunk = { ...parsed, rows: parsed.rows.slice(20) };
    expect(validateParsedCsvChunkPayload(chunk).rows.map((row) => row.id)).toEqual([
      "row_21",
      "row_22",
      "row_23",
      "row_24",
      "row_25",
    ]);
  });

  it("rejects duplicate or reordered IDs in a chunk", () => {
    const parsed = parseCsvText("Title\nOne\nTwo");
    expect(() =>
      validateParsedCsvChunkPayload({
        ...parsed,
        rows: [parsed.rows[1], parsed.rows[0]],
      }),
    ).toThrow("temporary CSV rows are invalid");
  });
});
