import { describe, expect, it } from "vitest";

import {
  buildClearLibraryFiltersUrl,
  buildLibraryUrl,
  countActiveLibraryFilters,
  DEFAULT_LIBRARY_SORT,
  getLibraryPagination,
  LIBRARY_SORTS,
  LIBRARY_SORT_ORDERS,
  MAX_LIBRARY_SEARCH_LENGTH,
  parseLibrarySearchParams,
} from "./query";

describe("library URL search-parameter parsing", () => {
  it("treats an empty or whitespace-only search as no search", () => {
    expect(parseLibrarySearchParams({}).state.q).toBe("");
    expect(parseLibrarySearchParams({ q: "   " }).state.q).toBe("");
  });

  it("trims search and preserves special characters as literal input", () => {
    expect(
      parseLibrarySearchParams({ q: "  50%_film,(director)\\test  " }).state.q,
    ).toBe("50%_film,(director)\\test");
  });

  it("caps search length and returns a safe warning", () => {
    const result = parseLibrarySearchParams({
      q: `  ${"a".repeat(MAX_LIBRARY_SEARCH_LENGTH + 20)}  `,
    });

    expect(result.state.q).toHaveLength(MAX_LIBRARY_SEARCH_LENGTH);
    expect(result.warnings).toContain(
      `Search is limited to ${MAX_LIBRARY_SEARCH_LENGTH} characters.`,
    );
  });

  it.each([
    "want_to_watch",
    "watch_next",
    "scheduled",
    "currently_watching",
    "watched",
    "on_hold",
    "dropped",
  ])("accepts the exact database status %s", (status) => {
    expect(parseLibrarySearchParams({ status }).state.status).toBe(status);
  });

  it("accepts watched, unwatched, and legacy filter parameters", () => {
    expect(parseLibrarySearchParams({ watched: "watched" }).state.watched).toBe(
      "watched",
    );
    expect(
      parseLibrarySearchParams({ watched: "unwatched" }).state.watched,
    ).toBe("unwatched");
    expect(parseLibrarySearchParams({ filter: "watched" }).state.watched).toBe(
      "watched",
    );
    expect(
      parseLibrarySearchParams({
        filter: "watched",
        watched: "unwatched",
      }).state.watched,
    ).toBe("unwatched");
  });

  it.each(["favourites", "not-favourites"])(
    "accepts favourite filter %s",
    (favourite) => {
      expect(parseLibrarySearchParams({ favourite }).state.favourite).toBe(
        favourite,
      );
    },
  );

  it("trims genre and director filters", () => {
    const state = parseLibrarySearchParams({
      genre: "  Science Fiction ",
      director: "  Christopher Nolan ",
    }).state;

    expect(state.genre).toBe("Science Fiction");
    expect(state.director).toBe("Christopher Nolan");
  });

  it("supports an exact four-digit year", () => {
    expect(parseLibrarySearchParams({ year: "1999" }, {}, 2026).state.year).toBe(
      1999,
    );
  });

  it("gives exact year precedence over a range", () => {
    const state = parseLibrarySearchParams(
      { year: "1999", yearFrom: "1980", yearTo: "2010" },
      {},
      2026,
    ).state;

    expect(state).toMatchObject({
      year: 1999,
      yearFrom: null,
      yearTo: null,
    });
  });

  it("supports a release-year range and ignores an inverted range", () => {
    expect(
      parseLibrarySearchParams(
        { yearFrom: "1980", yearTo: "1999" },
        {},
        2026,
      ).state,
    ).toMatchObject({ yearFrom: 1980, yearTo: 1999 });

    const invalid = parseLibrarySearchParams(
      { yearFrom: "2020", yearTo: "1990" },
      {},
      2026,
    );
    expect(invalid.state).toMatchObject({ yearFrom: null, yearTo: null });
    expect(invalid.warnings[0]).toMatch(/release-year range/i);
  });

  it("rejects non-four-digit and unreasonable years without throwing", () => {
    const state = parseLibrarySearchParams(
      { year: "99", yearFrom: "1887", yearTo: "2200" },
      {},
      2026,
    ).state;
    expect(state).toMatchObject({
      year: null,
      yearFrom: null,
      yearTo: null,
    });
  });

  it("supports decimal personal-rating ranges", () => {
    expect(
      parseLibrarySearchParams({ ratingMin: "7.5", ratingMax: "9.8" }).state,
    ).toMatchObject({ ratingMin: 7.5, ratingMax: 9.8 });
  });

  it("ignores invalid and inverted personal-rating ranges", () => {
    expect(
      parseLibrarySearchParams({ ratingMin: "-1", ratingMax: "11" }).state,
    ).toMatchObject({ ratingMin: null, ratingMax: null });

    const inverted = parseLibrarySearchParams({
      ratingMin: "9",
      ratingMax: "4",
    });
    expect(inverted.state).toMatchObject({
      ratingMin: null,
      ratingMax: null,
    });
    expect(inverted.warnings[0]).toMatch(/personal-rating range/i);
  });

  it("parses multiple filters together", () => {
    expect(
      parseLibrarySearchParams({
        q: "arrival",
        status: "watched",
        watched: "watched",
        favourite: "favourites",
        genre: "Drama",
        director: "Denis Villeneuve",
        yearFrom: "2010",
        yearTo: "2020",
        ratingMin: "8",
        ratingMax: "10",
      }).state,
    ).toMatchObject({
      q: "arrival",
      status: "watched",
      watched: "watched",
      favourite: "favourites",
      genre: "Drama",
      director: "Denis Villeneuve",
      yearFrom: 2010,
      yearTo: 2020,
      ratingMin: 8,
      ratingMax: 10,
    });
  });

  it("falls back safely for invalid filters, sort, view, page, and page size", () => {
    const state = parseLibrarySearchParams(
      {
        status: "private_other_user_status",
        watched: "yes",
        favourite: "top-rated",
        sort: "random",
        view: "table",
        page: "-2",
        perPage: "1000",
      },
      { defaultLibraryView: "list", moviesPerPage: 48 },
    ).state;

    expect(state).toMatchObject({
      status: "all",
      watched: "all",
      favourite: "all",
      sort: DEFAULT_LIBRARY_SORT,
      view: "list",
      page: 1,
      perPage: 48,
    });
  });

  it.each([12, 24, 48, 96])("accepts page size %i", (perPage) => {
    expect(
      parseLibrarySearchParams(
        { perPage: String(perPage) },
        { moviesPerPage: 24 },
      ).state.perPage,
    ).toBe(perPage);
  });

  it("uses the saved page-size and view defaults when URL overrides are absent", () => {
    expect(
      parseLibrarySearchParams(
        {},
        { defaultLibraryView: "list", moviesPerPage: 96 },
      ).state,
    ).toMatchObject({ view: "list", perPage: 96 });
  });

  it("uses only the first value for repeated URL parameters", () => {
    expect(
      parseLibrarySearchParams({
        status: ["watched", "dropped"],
        q: ["first", "second"],
      }).state,
    ).toMatchObject({ status: "watched", q: "first" });
  });
});

describe("library URL persistence and clearing", () => {
  const state = parseLibrarySearchParams({
    q: "inception",
    status: "watched",
    watched: "watched",
    favourite: "favourites",
    genre: "Science Fiction",
    director: "Christopher Nolan",
    year: "2010",
    ratingMin: "8",
    ratingMax: "10",
    sort: "title_asc",
    view: "list",
    perPage: "48",
    page: "3",
  }).state;

  it("preserves every recognized parameter between pages", () => {
    const url = buildLibraryUrl(state, { page: 4 });
    expect(url).toContain("q=inception");
    expect(url).toContain("status=watched");
    expect(url).toContain("favourite=favourites");
    expect(url).toContain("genre=Science+Fiction");
    expect(url).toContain("director=Christopher+Nolan");
    expect(url).toContain("sort=title_asc");
    expect(url).toContain("view=list");
    expect(url).toContain("perPage=48");
    expect(url).toContain("page=4");
  });

  it("resets page when search, filters, sort, or page size changes", () => {
    expect(buildLibraryUrl(state, { q: "tenet" }, { resetPage: true })).not.toContain(
      "page=",
    );
  });

  it("clears all filters without clearing search, sort, view, or page size", () => {
    const url = buildClearLibraryFiltersUrl(state);
    expect(url).toContain("q=inception");
    expect(url).toContain("sort=title_asc");
    expect(url).toContain("view=list");
    expect(url).toContain("perPage=48");
    expect(url).not.toContain("status=");
    expect(url).not.toContain("favourite=");
    expect(url).not.toContain("genre=");
    expect(url).not.toContain("director=");
    expect(url).not.toContain("year=");
    expect(url).not.toContain("rating");
    expect(url).not.toContain("page=");
  });

  it("counts distinct active filter groups", () => {
    expect(countActiveLibraryFilters(state)).toBe(7);
  });
});

describe("library sorting configuration", () => {
  it("defines all twelve sort options with a stable user_movies ID tie-breaker", () => {
    expect(LIBRARY_SORTS).toHaveLength(12);
    for (const sort of LIBRARY_SORTS) {
      expect(LIBRARY_SORT_ORDERS[sort].at(-1)).toEqual({
        column: "user_movie_id",
        ascending: true,
      });
    }
  });

  it.each([
    ["title_asc", "title", true],
    ["title_desc", "title", false],
    ["date_added_desc", "added_at", false],
    ["date_added_asc", "added_at", true],
    ["release_year_desc", "release_year", false],
    ["release_year_asc", "release_year", true],
    ["rating_desc", "personal_rating", false],
    ["rating_asc", "personal_rating", true],
    ["priority_desc", "priority", false],
    ["priority_asc", "priority", true],
    ["recently_watched", "watched_at", false],
    ["favourite_first", "favourite", false],
  ] as const)(
    "%s sorts first by %s in the expected direction",
    (sort, column, ascending) => {
      expect(LIBRARY_SORT_ORDERS[sort][0]).toMatchObject({
        column,
        ascending,
      });
    },
  );

  it.each([
    "release_year_desc",
    "release_year_asc",
    "rating_desc",
    "rating_asc",
    "recently_watched",
  ] as const)("%s keeps null values last", (sort) => {
    expect(LIBRARY_SORT_ORDERS[sort][0]?.nullsFirst).toBe(false);
  });
});

describe("library pagination calculation", () => {
  it("calculates first, middle, and final pages", () => {
    expect(getLibraryPagination(50, 1, 12)).toMatchObject({
      page: 1,
      totalPages: 5,
      firstItem: 1,
      lastItem: 12,
    });
    expect(getLibraryPagination(50, 3, 12)).toMatchObject({
      page: 3,
      firstItem: 25,
      lastItem: 36,
    });
    expect(getLibraryPagination(50, 5, 12)).toMatchObject({
      page: 5,
      firstItem: 49,
      lastItem: 50,
    });
  });

  it("clamps a page beyond the final page", () => {
    expect(getLibraryPagination(25, 99, 12)).toMatchObject({
      page: 3,
      totalPages: 3,
    });
  });

  it("preserves query state when deletion clamps an emptied final page", () => {
    const state = parseLibrarySearchParams({
      q: "matrix",
      status: "watched",
      favourite: "favourites",
      genre: "Science Fiction",
      director: "Lana Wachowski",
      sort: "title_asc",
      view: "list",
      page: "3",
      perPage: "12",
    }).state;
    const pagination = getLibraryPagination(24, state.page, state.perPage);
    const url = buildLibraryUrl(state, { page: pagination.page });

    expect(pagination.page).toBe(2);
    expect(url).toContain("q=matrix");
    expect(url).toContain("status=watched");
    expect(url).toContain("favourite=favourites");
    expect(url).toContain("genre=Science+Fiction");
    expect(url).toContain("director=Lana+Wachowski");
    expect(url).toContain("sort=title_asc");
    expect(url).toContain("view=list");
    expect(url).toContain("perPage=12");
    expect(url).toContain("page=2");
  });

  it("handles an empty result set", () => {
    expect(getLibraryPagination(0, 4, 24)).toEqual({
      page: 1,
      perPage: 24,
      totalItems: 0,
      totalPages: 1,
      firstItem: 0,
      lastItem: 0,
    });
  });
});
