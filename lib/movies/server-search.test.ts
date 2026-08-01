import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  enforceTmdbRateLimit: vi.fn(),
  readUserPreferences: vi.fn(),
  searchMovies: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/movies/rate-limit", () => ({
  enforceTmdbRateLimit: mocks.enforceTmdbRateLimit,
}));
vi.mock("@/lib/settings/supabase-settings", () => ({
  readUserPreferences: mocks.readUserPreferences,
}));
vi.mock("@/lib/movies/tmdb-provider", () => ({
  tmdbMovieProvider: {
    searchMovies: mocks.searchMovies,
  },
}));

import { AuthenticationRequiredError } from "@/lib/library/errors";
import { searchTmdbMoviesForCurrentUser } from "./server-search";

function authenticatedClient(userId = "verified-user") {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue(authenticatedClient());
  mocks.readUserPreferences.mockResolvedValue({
    showAdultResults: false,
    includeUnreleasedMovies: false,
    preferredLanguage: "en",
  });
  mocks.enforceTmdbRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 29,
  });
  mocks.searchMovies.mockResolvedValue([
    {
      tmdbId: 27205,
      title: "Inception",
      originalTitle: null,
      overview: null,
      posterPath: null,
      releaseDate: "2010-07-15",
      voteAverage: 8.4,
    },
  ]);
});

describe("authenticated server-side TMDB search", () => {
  it("derives identity and provider preferences on the server", async () => {
    await expect(
      searchTmdbMoviesForCurrentUser("  Inception  "),
    ).resolves.toHaveLength(1);

    expect(mocks.readUserPreferences).toHaveBeenCalledWith(
      expect.any(Object),
      "verified-user",
    );
    expect(mocks.enforceTmdbRateLimit).toHaveBeenCalledWith(
      expect.any(Object),
      "search",
    );
    expect(mocks.searchMovies).toHaveBeenCalledWith("Inception", {
      includeAdult: false,
      includeUnreleased: false,
      language: "en",
    });
  });

  it("deduplicates simultaneous identical requests for one user", async () => {
    let release!: () => void;
    mocks.searchMovies.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve([]);
        }),
    );

    const first = searchTmdbMoviesForCurrentUser("Arrival");
    const second = searchTmdbMoviesForCurrentUser("Arrival");
    await vi.waitFor(() => {
      expect(mocks.searchMovies).toHaveBeenCalledOnce();
    });
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
    expect(mocks.enforceTmdbRateLimit).toHaveBeenCalledOnce();
  });

  it("keeps separate users in separate in-flight and rate-limit scopes", async () => {
    mocks.createClient
      .mockResolvedValueOnce(authenticatedClient("user-a"))
      .mockResolvedValueOnce(authenticatedClient("user-b"));

    await Promise.all([
      searchTmdbMoviesForCurrentUser("The Matrix"),
      searchTmdbMoviesForCurrentUser("The Matrix"),
    ]);

    expect(mocks.enforceTmdbRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.searchMovies).toHaveBeenCalledTimes(2);
  });

  it("stops before preferences, rate limiting, or TMDB when auth is absent", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { code: "session_not_found" },
        }),
      },
    });

    await expect(
      searchTmdbMoviesForCurrentUser("Arrival"),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(mocks.readUserPreferences).not.toHaveBeenCalled();
    expect(mocks.enforceTmdbRateLimit).not.toHaveBeenCalled();
    expect(mocks.searchMovies).not.toHaveBeenCalled();
  });
});
