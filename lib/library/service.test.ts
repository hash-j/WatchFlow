import { describe, expect, it, vi } from "vitest";

import { AuthenticationRequiredError } from "./errors";
import { classifyUserMovieInsert } from "./duplicate";
import {
  addMovieToLibrary,
  listLibraryMovies,
  type LibraryDependencies,
} from "./service";

function createDependencies(
  overrides: Partial<LibraryDependencies> = {},
): LibraryDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue({
      userId: "verified-user-id",
      client: { scope: "authenticated" },
    }),
    resolveSharedMovie: vi.fn().mockResolvedValue({ id: "movie-row-id" }),
    insertUserMovie: vi.fn().mockResolvedValue("added"),
    listUserMovies: vi.fn().mockResolvedValue([]),
    getUserMovie: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("authenticated library service", () => {
  it("rejects unauthenticated add requests before TMDB or admin work", async () => {
    const dependencies = createDependencies({
      authenticate: vi.fn().mockResolvedValue(null),
    });

    await expect(addMovieToLibrary(603, dependencies)).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    expect(dependencies.resolveSharedMovie).not.toHaveBeenCalled();
    expect(dependencies.insertUserMovie).not.toHaveBeenCalled();
  });

  it("resolves shared metadata only after authentication", async () => {
    const resolveSharedMovie = vi
      .fn()
      .mockResolvedValue({ id: "movie-row-id" });
    const dependencies = createDependencies({ resolveSharedMovie });

    await expect(addMovieToLibrary(603, dependencies)).resolves.toBe("added");

    expect(resolveSharedMovie).toHaveBeenCalledOnce();
    expect(resolveSharedMovie).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "verified-user-id" }),
      603,
    );
  });

  it("successfully inserts user_movies with the saved shared movie ID", async () => {
    const insertUserMovie = vi.fn().mockResolvedValue("added");
    const dependencies = createDependencies({ insertUserMovie });

    await expect(addMovieToLibrary(603, dependencies)).resolves.toBe("added");

    expect(insertUserMovie).toHaveBeenCalledOnce();
    expect(insertUserMovie).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "verified-user-id" }),
      "movie-row-id",
    );
  });

  it("reports a unique-constraint duplicate without creating another record", async () => {
    const dependencies = createDependencies({
      insertUserMovie: vi.fn().mockResolvedValue("duplicate"),
    });

    await expect(addMovieToLibrary(603, dependencies)).resolves.toBe("duplicate");
    expect(dependencies.insertUserMovie).toHaveBeenCalledTimes(1);
    expect(dependencies.insertUserMovie).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "verified-user-id" }),
      "movie-row-id",
    );
    expect(classifyUserMovieInsert({ code: "23505" })).toBe("duplicate");
  });

  it("scopes private library reads to the verified session", async () => {
    const session = {
      userId: "verified-user-id",
      client: { scope: "authenticated" },
    };
    const listUserMoviesMock = vi.fn().mockResolvedValue([]);
    const dependencies = createDependencies({
      authenticate: vi.fn().mockResolvedValue(session),
      listUserMovies: listUserMoviesMock,
    });

    await listLibraryMovies(dependencies);

    expect(listUserMoviesMock).toHaveBeenCalledOnce();
    expect(listUserMoviesMock).toHaveBeenCalledWith(session);
  });

  it("does not insert user_movies when shared metadata resolution fails", async () => {
    const upsertError = new Error("safe test metadata failure");
    const insertUserMovie = vi.fn();
    const dependencies = createDependencies({
      resolveSharedMovie: vi.fn().mockRejectedValue(upsertError),
      insertUserMovie,
    });

    await expect(addMovieToLibrary(603, dependencies)).rejects.toBe(upsertError);
    expect(insertUserMovie).not.toHaveBeenCalled();
  });
});
