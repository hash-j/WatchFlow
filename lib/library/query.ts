import type { LibraryMovieStatus } from "@/lib/movies/types";
import { LIBRARY_MOVIE_STATUSES } from "@/lib/movies/types";
import {
  DEFAULT_USER_PREFERENCES,
  LIBRARY_VIEWS,
  MOVIES_PER_PAGE_OPTIONS,
  type LibraryView,
} from "@/lib/settings/types";

export const MAX_LIBRARY_SEARCH_LENGTH = 100;
export const MAX_LIBRARY_GENRE_LENGTH = 100;
export const MAX_LIBRARY_DIRECTOR_LENGTH = 150;
export const MIN_LIBRARY_RELEASE_YEAR = 1888;

export const LIBRARY_WATCHED_FILTERS = [
  "all",
  "watched",
  "unwatched",
] as const;
export type LibraryWatchedFilter =
  (typeof LIBRARY_WATCHED_FILTERS)[number];

export const LIBRARY_FAVOURITE_FILTERS = [
  "all",
  "favourites",
  "not-favourites",
] as const;
export type LibraryFavouriteFilter =
  (typeof LIBRARY_FAVOURITE_FILTERS)[number];

export const LIBRARY_SORTS = [
  "title_asc",
  "title_desc",
  "date_added_desc",
  "date_added_asc",
  "release_year_desc",
  "release_year_asc",
  "rating_desc",
  "rating_asc",
  "priority_desc",
  "priority_asc",
  "recently_watched",
  "favourite_first",
] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export const DEFAULT_LIBRARY_SORT: LibrarySort = "date_added_desc";

export const LIBRARY_SORT_LABELS: Record<LibrarySort, string> = {
  title_asc: "Title A–Z",
  title_desc: "Title Z–A",
  date_added_desc: "Date added: newest",
  date_added_asc: "Date added: oldest",
  release_year_desc: "Release year: newest",
  release_year_asc: "Release year: oldest",
  rating_desc: "Personal rating: highest",
  rating_asc: "Personal rating: lowest",
  priority_desc: "Priority: highest",
  priority_asc: "Priority: lowest",
  recently_watched: "Recently watched",
  favourite_first: "Favourites first",
};

export type LibraryOrder = {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
};

export const LIBRARY_SORT_ORDERS: Record<LibrarySort, readonly LibraryOrder[]> =
  {
    title_asc: [
      { column: "title", ascending: true, nullsFirst: false },
      { column: "user_movie_id", ascending: true },
    ],
    title_desc: [
      { column: "title", ascending: false, nullsFirst: false },
      { column: "user_movie_id", ascending: true },
    ],
    date_added_desc: [
      { column: "added_at", ascending: false, nullsFirst: false },
      { column: "user_movie_id", ascending: true },
    ],
    date_added_asc: [
      { column: "added_at", ascending: true, nullsFirst: false },
      { column: "user_movie_id", ascending: true },
    ],
    release_year_desc: [
      { column: "release_year", ascending: false, nullsFirst: false },
      { column: "title", ascending: true, nullsFirst: false },
      { column: "user_movie_id", ascending: true },
    ],
    release_year_asc: [
      { column: "release_year", ascending: true, nullsFirst: false },
      { column: "title", ascending: true, nullsFirst: false },
      { column: "user_movie_id", ascending: true },
    ],
    rating_desc: [
      { column: "personal_rating", ascending: false, nullsFirst: false },
      { column: "title", ascending: true, nullsFirst: false },
      { column: "user_movie_id", ascending: true },
    ],
    rating_asc: [
      { column: "personal_rating", ascending: true, nullsFirst: false },
      { column: "title", ascending: true, nullsFirst: false },
      { column: "user_movie_id", ascending: true },
    ],
    priority_desc: [
      { column: "priority", ascending: false, nullsFirst: false },
      { column: "title", ascending: true, nullsFirst: false },
      { column: "user_movie_id", ascending: true },
    ],
    priority_asc: [
      { column: "priority", ascending: true, nullsFirst: false },
      { column: "title", ascending: true, nullsFirst: false },
      { column: "user_movie_id", ascending: true },
    ],
    recently_watched: [
      { column: "watched_at", ascending: false, nullsFirst: false },
      { column: "title", ascending: true, nullsFirst: false },
      { column: "user_movie_id", ascending: true },
    ],
    favourite_first: [
      { column: "favourite", ascending: false, nullsFirst: false },
      { column: "added_at", ascending: false, nullsFirst: false },
      { column: "user_movie_id", ascending: true },
    ],
  };

export type RawLibrarySearchParams = Record<
  string,
  string | string[] | undefined
>;

export type LibraryQueryState = {
  q: string;
  status: LibraryMovieStatus | "all";
  watched: LibraryWatchedFilter;
  favourite: LibraryFavouriteFilter;
  genre: string | null;
  director: string | null;
  year: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  ratingMin: number | null;
  ratingMax: number | null;
  sort: LibrarySort;
  view: LibraryView;
  page: number;
  perPage: (typeof MOVIES_PER_PAGE_OPTIONS)[number];
};

export type ParsedLibraryQuery = {
  state: LibraryQueryState;
  warnings: string[];
};

export type LibraryQueryDefaults = {
  defaultLibraryView?: LibraryView;
  moviesPerPage?: number;
};

export type LibraryPagination = {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  firstItem: number;
  lastItem: number;
};

export type LibraryFacetCounts = {
  all: number;
  watched: number;
  unwatched: number;
  favourites: number;
};

export type LibraryFacets = {
  genres: string[];
  directors: string[];
  years: number[];
  counts: LibraryFacetCounts;
};

export const EMPTY_LIBRARY_FACETS: LibraryFacets = {
  genres: [],
  directors: [],
  years: [],
  counts: { all: 0, watched: 0, unwatched: 0, favourites: 0 },
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function trimmedValue(
  value: string | string[] | undefined,
  maximum: number,
) {
  const trimmed = firstValue(value)?.trim() ?? "";
  return trimmed.slice(0, maximum);
}

function enumValue<const T extends readonly string[]>(
  value: string | string[] | undefined,
  values: T,
  fallback: T[number],
): T[number] {
  const candidate = firstValue(value);
  return candidate && values.includes(candidate as T[number])
    ? (candidate as T[number])
    : fallback;
}

function positiveInteger(value: string | string[] | undefined, fallback: number) {
  const candidate = firstValue(value);

  if (!candidate || !/^\d+$/.test(candidate)) {
    return fallback;
  }

  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function releaseYear(
  value: string | string[] | undefined,
  maximumYear: number,
) {
  const candidate = firstValue(value);

  if (!candidate || !/^\d{4}$/.test(candidate)) {
    return null;
  }

  const parsed = Number(candidate);
  return parsed >= MIN_LIBRARY_RELEASE_YEAR && parsed <= maximumYear
    ? parsed
    : null;
}

function rating(value: string | string[] | undefined) {
  const candidate = firstValue(value)?.trim();

  if (
    !candidate ||
    !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(candidate)
  ) {
    return null;
  }

  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10
    ? parsed
    : null;
}

function preferredPageSize(
  value: number | undefined,
): (typeof MOVIES_PER_PAGE_OPTIONS)[number] {
  return MOVIES_PER_PAGE_OPTIONS.includes(
    value as (typeof MOVIES_PER_PAGE_OPTIONS)[number],
  )
    ? (value as (typeof MOVIES_PER_PAGE_OPTIONS)[number])
    : (DEFAULT_USER_PREFERENCES.moviesPerPage as (typeof MOVIES_PER_PAGE_OPTIONS)[number]);
}

export function parseLibrarySearchParams(
  raw: RawLibrarySearchParams,
  defaults: LibraryQueryDefaults = {},
  currentYear = new Date().getUTCFullYear(),
): ParsedLibraryQuery {
  const warnings: string[] = [];
  const maximumYear = currentYear + 5;
  const rawQuery = firstValue(raw.q)?.trim() ?? "";
  const q = rawQuery.slice(0, MAX_LIBRARY_SEARCH_LENGTH);

  if (rawQuery.length > MAX_LIBRARY_SEARCH_LENGTH) {
    warnings.push(
      `Search is limited to ${MAX_LIBRARY_SEARCH_LENGTH} characters.`,
    );
  }

  const rawGenre = firstValue(raw.genre)?.trim() ?? "";
  const genre = trimmedValue(raw.genre, MAX_LIBRARY_GENRE_LENGTH) || null;
  if (rawGenre.length > MAX_LIBRARY_GENRE_LENGTH) {
    warnings.push(
      `Genre is limited to ${MAX_LIBRARY_GENRE_LENGTH} characters.`,
    );
  }

  const rawDirector = firstValue(raw.director)?.trim() ?? "";
  const director =
    trimmedValue(raw.director, MAX_LIBRARY_DIRECTOR_LENGTH) || null;
  if (rawDirector.length > MAX_LIBRARY_DIRECTOR_LENGTH) {
    warnings.push(
      `Director is limited to ${MAX_LIBRARY_DIRECTOR_LENGTH} characters.`,
    );
  }

  const exactYear = releaseYear(raw.year, maximumYear);
  let yearFrom = exactYear ? null : releaseYear(raw.yearFrom, maximumYear);
  let yearTo = exactYear ? null : releaseYear(raw.yearTo, maximumYear);

  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
    yearFrom = null;
    yearTo = null;
    warnings.push("The release-year range was ignored because it is invalid.");
  }

  let ratingMin = rating(raw.ratingMin);
  let ratingMax = rating(raw.ratingMax);
  if (
    ratingMin !== null &&
    ratingMax !== null &&
    ratingMin > ratingMax
  ) {
    ratingMin = null;
    ratingMax = null;
    warnings.push("The personal-rating range was ignored because it is invalid.");
  }

  const legacyWatched = enumValue(
    raw.filter,
    LIBRARY_WATCHED_FILTERS,
    "all",
  );
  const defaultView = LIBRARY_VIEWS.includes(
    defaults.defaultLibraryView as LibraryView,
  )
    ? defaults.defaultLibraryView!
    : DEFAULT_USER_PREFERENCES.defaultLibraryView;
  const defaultPerPage = preferredPageSize(defaults.moviesPerPage);
  const requestedPageSize = positiveInteger(raw.perPage, defaultPerPage);
  const perPage = MOVIES_PER_PAGE_OPTIONS.includes(
    requestedPageSize as (typeof MOVIES_PER_PAGE_OPTIONS)[number],
  )
    ? (requestedPageSize as (typeof MOVIES_PER_PAGE_OPTIONS)[number])
    : defaultPerPage;

  return {
    state: {
      q,
      status: enumValue(raw.status, ["all", ...LIBRARY_MOVIE_STATUSES], "all"),
      watched:
        firstValue(raw.watched) === undefined
          ? legacyWatched
          : enumValue(raw.watched, LIBRARY_WATCHED_FILTERS, "all"),
      favourite: enumValue(
        raw.favourite,
        LIBRARY_FAVOURITE_FILTERS,
        "all",
      ),
      genre,
      director,
      year: exactYear,
      yearFrom,
      yearTo,
      ratingMin,
      ratingMax,
      sort: enumValue(raw.sort, LIBRARY_SORTS, DEFAULT_LIBRARY_SORT),
      view: enumValue(raw.view, LIBRARY_VIEWS, defaultView),
      page: positiveInteger(raw.page, 1),
      perPage,
    },
    warnings,
  };
}

export type LibraryUrlOverrides = Partial<LibraryQueryState>;

export function libraryStateToSearchParams(state: LibraryQueryState) {
  const params = new URLSearchParams();

  if (state.q) params.set("q", state.q);
  if (state.status !== "all") params.set("status", state.status);
  if (state.watched !== "all") params.set("watched", state.watched);
  if (state.favourite !== "all") {
    params.set("favourite", state.favourite);
  }
  if (state.genre) params.set("genre", state.genre);
  if (state.director) params.set("director", state.director);
  if (state.year !== null) params.set("year", String(state.year));
  if (state.yearFrom !== null) params.set("yearFrom", String(state.yearFrom));
  if (state.yearTo !== null) params.set("yearTo", String(state.yearTo));
  if (state.ratingMin !== null) {
    params.set("ratingMin", String(state.ratingMin));
  }
  if (state.ratingMax !== null) {
    params.set("ratingMax", String(state.ratingMax));
  }
  if (state.sort !== DEFAULT_LIBRARY_SORT) params.set("sort", state.sort);
  params.set("view", state.view);
  params.set("perPage", String(state.perPage));
  if (state.page > 1) params.set("page", String(state.page));

  return params;
}

export function buildLibraryUrl(
  state: LibraryQueryState,
  overrides: LibraryUrlOverrides = {},
  options: { resetPage?: boolean } = {},
) {
  const merged: LibraryQueryState = {
    ...state,
    ...overrides,
    page: options.resetPage ? 1 : (overrides.page ?? state.page),
  };
  const query = libraryStateToSearchParams(merged).toString();
  return query ? `/library?${query}` : "/library";
}

export function buildClearLibraryFiltersUrl(state: LibraryQueryState) {
  return buildLibraryUrl(
    state,
    {
      status: "all",
      watched: "all",
      favourite: "all",
      genre: null,
      director: null,
      year: null,
      yearFrom: null,
      yearTo: null,
      ratingMin: null,
      ratingMax: null,
    },
    { resetPage: true },
  );
}

export function countActiveLibraryFilters(state: LibraryQueryState) {
  return [
    state.status !== "all",
    state.watched !== "all",
    state.favourite !== "all",
    Boolean(state.genre),
    Boolean(state.director),
    state.year !== null || state.yearFrom !== null || state.yearTo !== null,
    state.ratingMin !== null || state.ratingMax !== null,
  ].filter(Boolean).length;
}

export function hasLibraryCriteria(state: LibraryQueryState) {
  return Boolean(state.q) || countActiveLibraryFilters(state) > 0;
}

export function getLibraryPagination(
  totalItems: number,
  page: number,
  perPage: number,
): LibraryPagination {
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return {
    page: safePage,
    perPage,
    totalItems,
    totalPages,
    firstItem: totalItems === 0 ? 0 : (safePage - 1) * perPage + 1,
    lastItem:
      totalItems === 0 ? 0 : Math.min(safePage * perPage, totalItems),
  };
}
