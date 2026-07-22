import { describe, expect, it } from "vitest";

import {
  CsvImportValidationError,
  parseCsvText,
  validateCsvFileMetadata,
} from "./csv";

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
});
