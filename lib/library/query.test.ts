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
  ])("accepts the exact database status %s", (status) => {
    expect(parseLibrarySearchParams({ status }).state.status).toBe(status);
  });

  it.each(["on_hold", "dropped"])(
    "does not expose legacy status %s as a new filter selection",
    (status) => {
      expect(parseLibrarySearchParams({ status }).state.status).toBe("all");
    },
  );

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

  it("trims genre, director, and actor filters", () => {
    const state = parseLibrarySearchParams({
      genre: "  Science Fiction ",
      director: "  Christopher Nolan ",
      actor: "  Cillian Murphy ",
    }).state;

    expect(state.genre).toBe("Science Fiction");
    expect(state.director).toBe("Christopher Nolan");
    expect(state.actor).toBe("Cillian Murphy");
  });

  it("caps actor length with a safe warning", () => {
    const result = parseLibrarySearchParams({ actor: "a".repeat(180) });

    expect(result.state.actor).toHaveLength(150);
    expect(result.warnings).toContain("Actor is limited to 150 characters.");
  });

  it("supports an exact four-digit year", () => {
    expect(parseLibrarySearchParams({ year: "1999" }, {}, 2026).state.year).toBe(
      1999,
    );
  });

  it("rejects non-four-digit and unreasonable years without throwing", () => {
    const state = parseLibrarySearchParams(
      { year: "99" },
      {},
      2026,
    ).state;
    expect(state.year).toBeNull();
  });

  it("parses multiple filters together", () => {
    expect(
      parseLibrarySearchParams({
        q: "arrival",
        status: "watched",
        watched: "watched",
        genre: "Drama",
        director: "Denis Villeneuve",
        actor: "Amy Adams",
        year: "2016",
      }).state,
    ).toMatchObject({
      q: "arrival",
      status: "watched",
      watched: "watched",
      genre: "Drama",
      director: "Denis Villeneuve",
      actor: "Amy Adams",
      year: 2016,
    });
  });

  it("falls back safely for invalid filters, sort, view, page, and page size", () => {
    const state = parseLibrarySearchParams(
      {
        status: "private_other_user_status",
        watched: "yes",
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
    genre: "Science Fiction",
    director: "Christopher Nolan",
    actor: "Leonardo DiCaprio",
    year: "2010",
    sort: "title_asc",
    view: "list",
    perPage: "48",
    page: "3",
  }).state;

  it("preserves every recognized parameter between pages", () => {
    const url = buildLibraryUrl(state, { page: 4 });
    expect(url).toContain("q=inception");
    expect(url).toContain("status=watched");
    expect(url).toContain("genre=Science+Fiction");
    expect(url).toContain("director=Christopher+Nolan");
    expect(url).toContain("actor=Leonardo+DiCaprio");
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
    expect(url).not.toContain("genre=");
    expect(url).not.toContain("director=");
    expect(url).not.toContain("actor=");
    expect(url).not.toContain("year=");
    expect(url).not.toContain("page=");
  });

  it("counts distinct active filter groups", () => {
    expect(countActiveLibraryFilters(state)).toBe(6);
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
      genre: "Science Fiction",
      director: "Lana Wachowski",
      actor: "Keanu Reeves",
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
    expect(url).toContain("genre=Science+Fiction");
    expect(url).toContain("director=Lana+Wachowski");
    expect(url).toContain("actor=Keanu+Reeves");
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
