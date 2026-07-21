import type { LibraryMovie } from "../movies/types";

export const LIBRARY_FILTERS = ["all", "unwatched", "watched"] as const;
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number];

export function normalizeLibraryFilter(value: unknown): LibraryFilter {
  return value === "watched" || value === "unwatched" ? value : "all";
}

export function getLibraryFilterCounts(movies: LibraryMovie[]) {
  const watched = movies.filter((item) => item.status === "watched").length;

  return {
    all: movies.length,
    watched,
    unwatched: movies.length - watched,
  };
}

export function filterLibraryMovies(
  movies: LibraryMovie[],
  filter: LibraryFilter,
) {
  if (filter === "watched") {
    return movies.filter((item) => item.status === "watched");
  }

  if (filter === "unwatched") {
    return movies.filter((item) => item.status !== "watched");
  }

  return movies;
}

export function getLibraryFilterEmptyMessage(filter: LibraryFilter) {
  if (filter === "watched") {
    return "No watched movies yet.";
  }

  if (filter === "unwatched") {
    return "You have no unwatched movies.";
  }

  return "No movies match this filter.";
}
