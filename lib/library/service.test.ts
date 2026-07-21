import { describe, expect, it, vi } from "vitest";

import type { MovieDetails } from "../movies/types";
import { AuthenticationRequiredError } from "./errors";
import { classifyUserMovieInsert } from "./duplicate";
import {
  addMovieToLibrary,
  listLibraryMovies,
  type LibraryDependencies,
} from "./service";

const movie: MovieDetails = {
  tmdbId: 603,
  title: "The Matrix",
  originalTitle: null,
  overview: "A hacker discovers the truth.",
  posterPath: "/poster.jpg",
  backdropPath: "/backdrop.jpg",
  releaseDate: "1999-03-30",
  voteAverage: 8.2,
  runtimeMinutes: 136,
  genres: ["Action", "Science Fiction"],
  director: "Lana Wachowski",
  cast: [{ name: "Keanu Reeves", character: "Neo" }],
  trailer: { key: "trailer-key", name: "Official Trailer", site: "YouTube" },
};

function createDependencies(
  overrides: Partial<LibraryDependencies> = {},
): LibraryDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue({
      userId: "verified-user-id",
      client: { scope: "authenticated" },
    }),
    getMovieDetails: vi.fn().mockResolvedValue(movie),
    upsertSharedMovie: vi.fn().mockResolvedValue({ id: "movie-row-id" }),
    insertUserMovie: vi.fn().mockResolvedValue("added"),
    listUserMovies: vi.fn().mockResolvedValue([]),
    getUserMovie: vi.fn().mockResolvedValue(null),
    removeUserMovie: vi.fn().mockResolvedValue(true),
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
    expect(dependencies.getMovieDetails).not.toHaveBeenCalled();
    expect(dependencies.upsertSharedMovie).not.toHaveBeenCalled();
    expect(dependencies.insertUserMovie).not.toHaveBeenCalled();
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
});
