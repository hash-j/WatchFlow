import { describe, expect, it } from "vitest";

import {
  buildAccountDataExport,
  buildLibraryCsv,
  CSV_EXPORT_HEADERS,
  escapeCsvCell,
  exportFilenameDate,
} from "./export";

const libraryRow = {
  status: "watched",
  favourite: true,
  personal_rating: 9,
  review: "Great, but a \"wild\" ending\nSecond line",
  priority: 4,
  queue_position: null,
  scheduled_for: null,
  schedule_timezone: null,
  schedule_note: null,
  watched_at: "2026-07-20T00:00:00.000Z",
  would_watch_again: true,
  created_at: "2026-07-01T12:00:00.000Z",
  updated_at: "2026-07-20T12:00:00.000Z",
  movies: {
    title: "Movie, The",
    original_title: '=HYPERLINK("https://bad.invalid")',
    release_year: 2025,
    director: "Director",
    main_cast: [{ name: "One" }, { name: "Two" }],
    genres: ["Drama", "Mystery"],
    public_rating: 7.5,
    tmdb_id: 42,
  },
};

describe("CSV account export", () => {
  it("returns a valid header-only CSV for an empty library", () => {
    expect(buildLibraryCsv([])).toBe(CSV_EXPORT_HEADERS.join(","));
  });

  it("includes the exact public export headers", () => {
    expect(buildLibraryCsv([libraryRow]).split("\r\n")[0]).toBe(
      CSV_EXPORT_HEADERS.join(","),
    );
  });

  it("escapes quotes, commas, and line breaks", () => {
    expect(escapeCsvCell('A, "quote"\nline')).toBe(
      '"A, ""quote""\nline"',
    );
  });

  it.each(["=SUM(A1:A2)", "+cmd", "-1+1", "@formula", "*formula"])(
    "neutralizes spreadsheet formula input %s",
    (value) => {
      expect(escapeCsvCell(value)).toBe(`'${value}`);
    },
  );

  it("neutralizes a formula after a leading line break", () => {
    expect(escapeCsvCell("\n=SUM(A1:A2)")).toBe(
      "\"'\n=SUM(A1:A2)\"",
    );
  });

  it("exports only the rows supplied by the authenticated query", () => {
    const csv = buildLibraryCsv([libraryRow]);
    expect(csv).toContain('"Movie, The"');
    expect(csv).not.toContain("another-user-movie");
    expect(csv).toContain("'=HYPERLINK");
  });

  it.each(["on_hold", "dropped"])(
    "keeps legacy status %s readable in CSV and JSON exports",
    (status) => {
      const legacyRow = { ...libraryRow, status };
      const csv = buildLibraryCsv([legacyRow]);
      const json = buildAccountDataExport({
        exportedAt: "2026-09-10T00:00:00.000Z",
        email: "member@example.com",
        profile: null,
        preferences: null,
        library: [legacyRow],
      });

      expect(csv).toContain(status);
      expect(json.library[0]?.status).toBe(status);
    },
  );

  it("builds the dated filename suffix", () => {
    expect(exportFilenameDate(new Date("2026-07-22T23:59:59.000Z"))).toBe(
      "2026-07-22",
    );
  });
});

describe("complete JSON account export", () => {
  it("has the documented structure and format version without secrets", () => {
    const result = buildAccountDataExport({
      exportedAt: "2026-07-22T12:00:00.000Z",
      email: "member@example.com",
      profile: {
        id: "internal-user-id",
        full_name: "Member",
        timezone: "UTC",
        subscription_plan: "internal",
      },
      preferences: null,
      library: [libraryRow],
    });
    const json = JSON.stringify(result);

    expect(result).toMatchObject({
      exportedAt: "2026-07-22T12:00:00.000Z",
      profile: { email: "member@example.com", fullName: "Member" },
      metadata: { formatVersion: 2 },
    });
    expect(result.library).toHaveLength(1);
    expect(result.customLists).toEqual([]);
    expect(result.library[0]?.favourite).toBe(true);
    expect(result.schedules).toHaveLength(0);
    expect(json).not.toContain("internal-user-id");
    expect(json).not.toContain("subscription_plan");
    expect(json).not.toMatch(/password|refresh_token|service_role|secret_key/i);
  });

  it("includes private custom-list memberships without internal identifiers", () => {
    const result = buildAccountDataExport({
      exportedAt: "2026-07-22T12:00:00.000Z",
      email: "member@example.com",
      profile: null,
      preferences: null,
      library: [],
      lists: [
        {
          id: "internal-list-id",
          user_id: "internal-user-id",
          name: "Weekend Movies",
          description: "Private picks",
          visibility: "private",
          list_movies: [
            {
              id: "internal-membership-id-2",
              position: 2,
              user_movies: {
                id: "internal-user-movie-id-2",
                movies: { title: "Arrival", tmdb_id: 329865 },
              },
            },
            {
              id: "internal-membership-id-1",
              position: 1,
              user_movies: {
                id: "internal-user-movie-id-1",
                movies: { title: "Inception", tmdb_id: 27205 },
              },
            },
          ],
        },
      ],
    });
    const json = JSON.stringify(result);

    expect(result.customLists).toEqual([
      expect.objectContaining({
        name: "Weekend Movies",
        visibility: "private",
        movies: [
          expect.objectContaining({ position: 1, title: "Inception" }),
          expect.objectContaining({ position: 2, title: "Arrival" }),
        ],
      }),
    ]);
    expect(json).not.toContain("internal-list-id");
    expect(json).not.toContain("internal-membership-id");
    expect(json).not.toContain("internal-user-id");
  });
});
