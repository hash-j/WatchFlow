import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, readUserPreferencesMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  readUserPreferencesMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({ createClient: createClientMock }));
vi.mock("../supabase/error-logging", () => ({
  logSupabaseError: vi.fn(),
}));
vi.mock("../settings/supabase-settings", () => ({
  readUserPreferences: readUserPreferencesMock,
}));

import {
  LibraryAuthorizationError,
  LibrarySchemaError,
} from "./errors";
import { parseLibrarySearchParams } from "./query";
import {
  getLibraryPageData,
  queryOwnedLibraryPage,
  readOwnedLibraryFacets,
} from "./supabase-query";

function createRowsBuilder(result: {
  data: unknown;
  count: number | null;
  error: unknown;
}) {
  const builder = {
    order: vi.fn(),
    range: vi.fn().mockResolvedValue(result),
  };
  builder.order.mockReturnValue(builder);
  return builder;
}

const row = {
  user_movie_id: "11111111-1111-4111-8111-111111111111",
  movie_id: 42,
  status: "watched",
  favourite: true,
  personal_rating: 9,
  priority: 4,
  watched_at: "2026-07-01T00:00:00.000Z",
  added_at: "2026-06-01T00:00:00.000Z",
  tmdb_id: 27205,
  title: "Inception",
  original_title: "Inception",
  poster_path: "/poster.jpg",
  release_date: "2010-07-16",
  release_year: 2010,
  public_rating: 8.4,
};

beforeEach(() => {
  createClientMock.mockReset();
  readUserPreferencesMock.mockReset();
});

describe("private Supabase library page query", () => {
  it("passes typed filters to the owner-derived RPC before applying range", async () => {
    const builder = createRowsBuilder({ data: [row], count: 1, error: null });
    const rpc = vi.fn().mockReturnValue(builder);
    const client = { rpc } as unknown as SupabaseClient;
    const state = parseLibrarySearchParams({
      q: "  50%_,(film)\\ ",
      status: "watched",
      watched: "watched",
      favourite: "favourites",
      genre: "Drama",
      director: "Director",
      year: "2010",
      ratingMin: "8.5",
      ratingMax: "10",
      page: "2",
      perPage: "12",
    }).state;

    await queryOwnedLibraryPage(client, state);

    expect(rpc).toHaveBeenCalledWith(
      "watchflow_library_rows",
      {
        p_query: "50%_,(film)\\",
        p_status: "watched",
        p_watched: true,
        p_favourite: true,
        p_genre: "Drama",
        p_director: "Director",
        p_year: 2010,
        p_year_from: null,
        p_year_to: null,
        p_rating_min: 8.5,
        p_rating_max: 10,
      },
      { count: "exact" },
    );
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("user_id");
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_user_id");
    expect(builder.range).toHaveBeenCalledWith(12, 23);
  });

  it("returns the filtered exact count rather than the rendered page length", async () => {
    const builder = createRowsBuilder({ data: [row], count: 137, error: null });
    const client = {
      rpc: vi.fn().mockReturnValue(builder),
    } as unknown as SupabaseClient;
    const state = parseLibrarySearchParams({ perPage: "24" }).state;

    await expect(queryOwnedLibraryPage(client, state)).resolves.toMatchObject({
      totalItems: 137,
      items: [expect.objectContaining({ libraryId: row.user_movie_id })],
    });
    expect(builder.range).toHaveBeenCalledWith(0, 23);
  });

  it("applies stable sort columns with explicit null placement", async () => {
    const builder = createRowsBuilder({ data: [], count: 0, error: null });
    const client = {
      rpc: vi.fn().mockReturnValue(builder),
    } as unknown as SupabaseClient;
    const state = parseLibrarySearchParams({
      sort: "rating_asc",
    }).state;

    await queryOwnedLibraryPage(client, state);

    expect(builder.order).toHaveBeenNthCalledWith(1, "personal_rating", {
      ascending: true,
      nullsFirst: false,
    });
    expect(builder.order).toHaveBeenNthCalledWith(2, "title", {
      ascending: true,
      nullsFirst: false,
    });
    expect(builder.order).toHaveBeenNthCalledWith(3, "user_movie_id", {
      ascending: true,
      nullsFirst: undefined,
    });
  });

  it("loads only owner-scoped facets returned by the authenticated RPC", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          genres: ["Drama", " drama ", "", null],
          directors: ["Director B", "Director A"],
          years: [2024, 1999, 2024],
          counts: { all: 10, watched: 4, unwatched: 6, favourites: 3 },
        },
        error: null,
      }),
    } as unknown as SupabaseClient;

    await expect(readOwnedLibraryFacets(client)).resolves.toEqual({
      genres: ["drama"],
      directors: ["Director A", "Director B"],
      years: [2024, 1999],
      counts: { all: 10, watched: 4, unwatched: 6, favourites: 3 },
    });
    expect(client.rpc).toHaveBeenCalledWith(
      "watchflow_library_filter_options",
    );
  });

  it("maps RLS and missing-migration errors safely", async () => {
    const state = parseLibrarySearchParams({}).state;
    const unauthorized = {
      rpc: vi.fn().mockReturnValue(
        createRowsBuilder({
          data: null,
          count: null,
          error: { code: "42501", message: "RLS" },
        }),
      ),
    } as unknown as SupabaseClient;
    const missing = {
      rpc: vi.fn().mockReturnValue(
        createRowsBuilder({
          data: null,
          count: null,
          error: { code: "PGRST202", message: "missing function" },
        }),
      ),
    } as unknown as SupabaseClient;

    await expect(queryOwnedLibraryPage(unauthorized, state)).rejects.toBeInstanceOf(
      LibraryAuthorizationError,
    );
    await expect(queryOwnedLibraryPage(missing, state)).rejects.toBeInstanceOf(
      LibrarySchemaError,
    );
  });
});

describe("library query session and preference reuse", () => {
  it("authenticates once and reads preferences through the same client", async () => {
    const rows = createRowsBuilder({ data: [row], count: 1, error: null });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "verified-user-id" } },
      error: null,
    });
    const rpc = vi.fn((name: string) =>
      name === "watchflow_library_rows"
        ? rows
        : Promise.resolve({
            data: {
              genres: [],
              directors: [],
              years: [],
              counts: { all: 1, watched: 1, unwatched: 0, favourites: 1 },
            },
            error: null,
          }),
    );
    const client = { auth: { getUser }, rpc };
    createClientMock.mockResolvedValue(client);
    readUserPreferencesMock.mockResolvedValue({
      defaultLibraryView: "list",
      moviesPerPage: 48,
    });

    const result = await getLibraryPageData({});

    expect(getUser).toHaveBeenCalledOnce();
    expect(readUserPreferencesMock).toHaveBeenCalledWith(
      client,
      "verified-user-id",
    );
    expect(result.state).toMatchObject({ view: "list", perPage: 48 });
    expect(result.pagination.totalItems).toBe(1);
  });
});

