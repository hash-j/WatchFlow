import { describe, expect, it } from "vitest";
import { compareListMovies, sortListMovies } from "./sorting";
import type { CustomListMovie } from "./types";

const movie = (id: string, title: string, releaseYear: number | null, position: number): CustomListMovie => ({
  listMovieId: id, listId: "list", userMovieId: id, position, status: "want_to_watch", personalRating: null, favourite: false,
  movie: { id, title, releaseYear, releaseDate: null, originalTitle: null, posterPath: null },
});
const rows = [movie("c", "Zebra", 2020, 1), movie("b", "Beta", 1990, 2), movie("d", "Unknown", null, 3), movie("a", "Alpha", 1990, 4)];
describe("custom list display sorting", () => {
  it.each([
    ["year-asc", ["a", "b", "c", "d"]], ["year-desc", ["c", "a", "b", "d"]],
    ["title-asc", ["a", "b", "d", "c"]], ["title-desc", ["c", "d", "b", "a"]],
    ["manual", ["c", "b", "d", "a"]],
  ] as const)("%s leaves saved positions and memberships untouched", (mode, expected) => {
    const original = structuredClone(rows);
    expect(sortListMovies(rows, mode).map(row => row.userMovieId)).toEqual(expected);
    expect(rows).toEqual(original);
  });
  it("puts missing years last, falls back to release dates/title/ID deterministically", () => {
    const mixed = [movie("z", "Equal", null, 1), movie("a", "Equal", null, 2), movie("b", "Before", null, 3)];
    expect(sortListMovies(mixed, "year-asc").map(row => row.userMovieId)).toEqual(["b", "a", "z"]);
    mixed[0].movie.releaseDate = "1980-05-01";
    expect(sortListMovies(mixed, "year-desc")[0].userMovieId).toBe("z");
  });
  it("orders an append batch independently from selection or query order", () => {
    const values = rows.map(row => ({ ...row.movie, id: row.userMovieId }));
    expect([...values].reverse().sort(compareListMovies).map(row => row.id)).toEqual(["a", "b", "c", "d"]);
  });
});
