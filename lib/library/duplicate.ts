import type { AddLibraryMovieResult } from "./service";

type DatabaseError = { code?: string } | null;

export function classifyUserMovieInsert(error: DatabaseError):
  | AddLibraryMovieResult
  | "error" {
  if (!error) {
    return "added";
  }

  return error.code === "23505" ? "duplicate" : "error";
}
