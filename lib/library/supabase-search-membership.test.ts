import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  logSupabaseError: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/auth", () => ({
  getAuthContext: mocks.getAuthContext,
}));
vi.mock("@/lib/supabase/error-logging", () => ({
  logSupabaseError: mocks.logSupabaseError,
}));

import { LibraryPersistenceError } from "./errors";
import { getCurrentUserSearchOwnedTmdbIds } from "./supabase-search-membership";

function membershipClient(result: { data: unknown; error: unknown }) {
  const inFilter = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ in: inFilter }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, from, select, eq, inFilter };
}

beforeEach(() => vi.clearAllMocks());

describe("Search Library membership", () => {
  it("uses one owner-scoped set query for all Search TMDB IDs", async () => {
    const fixture = membershipClient({
      data: [
        { movies: { tmdb_id: 27205 } },
        { movies: [{ tmdb_id: 603 }] },
      ],
      error: null,
    });
    mocks.getAuthContext.mockResolvedValue({
      client: fixture.client,
      user: { id: "verified-user" },
    });

    await expect(
      getCurrentUserSearchOwnedTmdbIds([27205, 603, 27205, 329865]),
    ).resolves.toEqual(new Set([27205, 603]));

    expect(fixture.from).toHaveBeenCalledOnce();
    expect(fixture.from).toHaveBeenCalledWith("user_movies");
    expect(fixture.select).toHaveBeenCalledWith("movies!inner(tmdb_id)");
    expect(fixture.eq).toHaveBeenCalledWith("user_id", "verified-user");
    expect(fixture.inFilter).toHaveBeenCalledWith(
      "movies.tmdb_id",
      [27205, 603, 329865],
    );
  });

  it("does not treat another user's shared movie row as current-user ownership", async () => {
    const fixture = membershipClient({ data: [], error: null });
    mocks.getAuthContext.mockResolvedValue({
      client: fixture.client,
      user: { id: "verified-user-b" },
    });

    await expect(getCurrentUserSearchOwnedTmdbIds([27205])).resolves.toEqual(
      new Set(),
    );
    expect(fixture.eq).toHaveBeenCalledWith("user_id", "verified-user-b");
  });

  it("does not query private membership for an empty result set", async () => {
    await expect(getCurrentUserSearchOwnedTmdbIds([])).resolves.toEqual(new Set());
    expect(mocks.getAuthContext).not.toHaveBeenCalled();
  });

  it("returns a safe error when the owner-scoped membership read fails", async () => {
    const fixture = membershipClient({
      data: null,
      error: { code: "42501", message: "private detail" },
    });
    mocks.getAuthContext.mockResolvedValue({
      client: fixture.client,
      user: { id: "verified-user" },
    });

    await expect(getCurrentUserSearchOwnedTmdbIds([27205])).rejects.toBeInstanceOf(
      LibraryPersistenceError,
    );
    expect(mocks.logSupabaseError).toHaveBeenCalledOnce();
  });
});
