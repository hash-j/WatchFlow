import type { CustomListMovie } from "./types";

export const LIST_SORT_OPTIONS = [
  ["manual", "Manual order"],
  ["year-asc", "Year: Oldest first"],
  ["year-desc", "Year: Newest first"],
  ["title-asc", "Title: A-Z"],
  ["title-desc", "Title: Z-A"],
] as const;
export type ListSortMode = (typeof LIST_SORT_OPTIONS)[number][0];
type SortableMovie = { id: string; title: string; releaseYear: number | null; releaseDate?: string | null };

function year(movie: SortableMovie) {
  if (Number.isInteger(movie.releaseYear) && movie.releaseYear! > 0) return movie.releaseYear;
  const value = movie.releaseDate?.match(/^(\d{4})-/)?.[1];
  return value && Number(value) > 0 ? Number(value) : null;
}
const textOrder = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0);
export function compareListMovies(a: SortableMovie, b: SortableMovie, mode: Exclude<ListSortMode, "manual"> = "year-asc") {
  const title = textOrder(a.title, b.title);
  if (mode.startsWith("year")) {
    const left = year(a), right = year(b);
    // Unknown release years stay at the end in both directions.
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    if (left !== null && right !== null && left !== right) return (left - right) * (mode === "year-desc" ? -1 : 1);
    return title || textOrder(a.id, b.id);
  }
  return title * (mode === "title-desc" ? -1 : 1) || textOrder(a.id, b.id);
}
export function sortListMovies(movies: CustomListMovie[], mode: ListSortMode) {
  return mode === "manual" ? [...movies] : [...movies].sort((a, b) => compareListMovies(
    { ...a.movie, id: a.userMovieId }, { ...b.movie, id: b.userMovieId }, mode,
  ));
}
