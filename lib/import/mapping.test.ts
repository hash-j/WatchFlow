import { describe, expect, it } from "vitest";

import { parseCsvText } from "./csv";
import {
  canMatchImportRow,
  ImportMappingValidationError,
  suggestColumnMappings,
  validateAndMapRows,
  validateColumnMapping,
} from "./mapping";

describe("CSV column mapping", () => {
  it("suggests known header aliases without assuming generic Rating", () => {
    const parsed = parseCsvText(
      "Movie Name,Year,Type,Notes,Rating,Personal Rating\nInception,2010,Sci-Fi,Great,9,8.5",
    );
    const suggestions = suggestColumnMappings(parsed.columns);

    expect(suggestions).toMatchObject({
      title: "column_1",
      releaseYear: "column_2",
      genres: "column_3",
      review: "column_4",
      personalRating: "column_6",
    });
    expect(Object.values(suggestions)).not.toContain("column_5");
  });

  it("maps WatchFlow export identity, favourite, and watch-again columns", () => {
    const parsed = parseCsvText(
      "Title,TMDB ID,Favourite,Would Watch Again\nInception,27205,Yes,No",
    );
    const mapping = suggestColumnMappings(parsed.columns);
    const row = validateAndMapRows(parsed, mapping)[0];
    expect(mapping).toMatchObject({
      title: "column_1",
      tmdbId: "column_2",
      favourite: "column_3",
      wouldWatchAgain: "column_4",
    });
    expect(row).toMatchObject({ tmdbId: 27205, favourite: true, wouldWatchAgain: false });
  });

  it("requires a title mapping", () => {
    const parsed = parseCsvText("Name\nInception");
    expect(() => validateColumnMapping({}, parsed.columns)).toThrow(
      ImportMappingValidationError,
    );
  });

  it("rejects duplicate column mappings", () => {
    const parsed = parseCsvText("Title\nInception");
    expect(() =>
      validateColumnMapping(
        { title: "column_1", director: "column_1" },
        parsed.columns,
      ),
    ).toThrow("only one WatchFlow field");
  });

  it("rejects unknown mapped columns and ignores unmapped CSV columns", () => {
    const parsed = parseCsvText("Title,Unexpected\nInception,value");
    expect(() =>
      validateColumnMapping({ title: "missing" }, parsed.columns),
    ).toThrow("unknown CSV column");
    expect(
      validateAndMapRows(parsed, { title: "column_1" })[0].title,
    ).toBe("Inception");
  });
});

describe("mapped row validation", () => {
  it("flags invalid years", () => {
    const parsed = parseCsvText("Title,Year\nInception,twenty-ten");
    const row = validateAndMapRows(parsed, {
      title: "column_1",
      releaseYear: "column_2",
    })[0];
    expect(row.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_year" })]),
    );
  });

  it("supports empty and decimal ratings", () => {
    const parsed = parseCsvText("Title,Rating\nInception,\nArrival,8.5");
    const rows = validateAndMapRows(parsed, {
      title: "column_1",
      personalRating: "column_2",
    });
    expect(rows[0].personalRating).toBeNull();
    expect(rows[1].personalRating).toBe(8.5);
  });

  it("flags ratings outside 0 through 10", () => {
    const parsed = parseCsvText("Title,Rating\nInception,11");
    const row = validateAndMapRows(parsed, {
      title: "column_1",
      personalRating: "column_2",
    })[0];
    expect(row.issues[0].code).toBe("invalid_rating");
  });

  it("validates positive whole-number TMDB IDs and Yes/No metadata", () => {
    const parsed = parseCsvText(
      "Title,TMDB ID,Favourite,Would Watch Again\nInception,nope,maybe,sometimes",
    );
    const row = validateAndMapRows(parsed, {
      title: "column_1",
      tmdbId: "column_2",
      favourite: "column_3",
      wouldWatchAgain: "column_4",
    })[0];
    expect(row.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "invalid_tmdb_id",
        "invalid_favourite",
        "invalid_watch_again",
      ]),
    );
  });

  it("retains which optional metadata columns were supplied", () => {
    const parsed = parseCsvText("Title,Review\nInception,");
    const row = validateAndMapRows(parsed, {
      title: "column_1",
      review: "column_2",
    })[0];
    expect(row.suppliedFields).toEqual(["title", "review"]);
    expect(row.review).toBeNull();
  });

  it("does not guess an ambiguous watched date", () => {
    const parsed = parseCsvText("Title,Date\nInception,01/02/2026");
    const row = validateAndMapRows(parsed, {
      title: "column_1",
      watchedDate: "column_2",
    })[0];
    expect(row.issues[0].code).toBe("invalid_watched_date");
  });

  it("maps known statuses and flags unknown statuses for review", () => {
    const parsed = parseCsvText(
      "Title,Status\nInception,Complete\nArrival,Maybe Later\nDune,Scheduled",
    );
    const rows = validateAndMapRows(parsed, {
      title: "column_1",
      status: "column_2",
    });
    expect(rows[0].status).toBe("watched");
    expect(rows[1].status).toBeNull();
    expect(rows[1].issues[0]).toMatchObject({
      code: "unknown_status",
      severity: "review",
    });
    expect(rows[2].status).toBeNull();
    expect(rows[2].issues[0]).toMatchObject({
      code: "unknown_status",
      severity: "review",
    });
    expect(canMatchImportRow(rows[1])).toBe(true);
    expect(canMatchImportRow(rows[2])).toBe(true);
  });

  it("flags duplicate title and year rows inside the CSV", () => {
    const parsed = parseCsvText(
      "Title,Year\nInception,2010\n inception ,2010",
    );
    const rows = validateAndMapRows(parsed, {
      title: "column_1",
      releaseYear: "column_2",
    });
    expect(rows[1].issues[0].code).toBe("duplicate_csv_row");
  });

  it("does not collapse distinct Urdu titles into one duplicate key", () => {
    const parsed = parseCsvText(
      "Title,Year\nدل والے,2015\nخدا کے لیے,2015",
    );
    const rows = validateAndMapRows(parsed, {
      title: "column_1",
      releaseYear: "column_2",
    });

    expect(rows[0].issues).toEqual([]);
    expect(rows[1].issues).toEqual([]);
  });
});
