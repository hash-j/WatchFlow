import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, logSupabaseErrorMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  logSupabaseErrorMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/supabase/error-logging", () => ({
  logSupabaseError: logSupabaseErrorMock,
}));

import {
  ListsAuthenticationError,
  ListsAuthorizationError,
  ListsConflictError,
  ListsMissingColumnError,
  ListsMissingRpcError,
  ListsMissingTableError,
  ListsNotFoundError,
  ListsPersistenceError,
  ListsSchemaCacheError,
  ListsValidationError,
} from "./errors";
import {
  addOwnedMoviesToList,
  authenticateLists,
  createOwnedCustomList,
  deleteOwnedCustomList,
  moveOwnedCustomList,
  moveOwnedListItem,
  removeOwnedListMovie,
  setOwnedMovieListMemberships,
  updateOwnedCustomList,
} from "./supabase-lists";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const listId = "11111111-1111-4111-8111-111111111111";
const listMovieId = "22222222-2222-4222-8222-222222222222";
const userMovieId = "33333333-3333-4333-8333-333333333333";
const secondUserMovieId = "44444444-4444-4444-8444-444444444444";

const listRow = {
  id: listId,
  name: "Weekend Movies",
  description: null,
  visibility: "private",
  created_at: "2026-07-29T10:00:00.000Z",
  updated_at: "2026-07-29T10:00:00.000Z",
};

const rpcResult = {
  success: true,
  reason: null,
  list_id: listId,
  moved: true,
  removed: true,
  final_position: 2,
  requested: 2,
  matched: 2,
  added_count: 2,
  removed_count: 1,
  skipped_count: 0,
  unchanged_count: 0,
};

type QueryResult = { data: unknown; error: unknown };

function queryBuilder(
  terminal: "single" | "maybeSingle",
  result: QueryResult,
) {
  const builder = {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };

  builder.insert.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.delete.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder[terminal].mockResolvedValue(result);
  return builder;
}

function authenticatedClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId, email: "member@example.com" } },
        error: null,
      }),
    },
    ...overrides,
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("custom-list authentication and owner filters", () => {
  it("authenticates every list boundary with auth.getUser", async () => {
    const client = authenticatedClient();
    createClientMock.mockResolvedValue(client);

    const session = await authenticateLists();

    expect(client.auth.getUser).toHaveBeenCalledOnce();
    expect(session.user.id).toBe(userId);
    expect(session.client).toBe(client);
  });

  it("rejects an expired session without exposing provider details", async () => {
    const providerError = {
      message: "JWT expired",
      code: "bad_jwt",
      details: "safe detail",
      hint: null,
    };
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: providerError,
        }),
      },
    } as unknown as SupabaseClient;
    createClientMock.mockResolvedValue(client);

    await expect(authenticateLists()).rejects.toBeInstanceOf(
      ListsAuthenticationError,
    );
    expect(logSupabaseErrorMock).toHaveBeenCalledWith(
      "custom lists authentication failed",
      providerError,
    );
  });

  it("creates a private list with only the verified server user ID", async () => {
    const builder = queryBuilder("single", { data: listRow, error: null });
    const from = vi.fn().mockReturnValue(builder);
    const client = authenticatedClient({ from });
    createClientMock.mockResolvedValue(client);

    await expect(
      createOwnedCustomList({
        name: "Weekend Movies",
        description: null,
      }),
    ).resolves.toMatchObject({ id: listId, visibility: "private" });

    expect(from).toHaveBeenCalledWith("lists");
    expect(builder.insert).toHaveBeenCalledWith({
      user_id: userId,
      name: "Weekend Movies",
      description: null,
    });
    expect(builder.insert.mock.calls[0]?.[0]).not.toHaveProperty("visibility");
  });

  it("classifies a normalized-name conflict only during list creation", async () => {
    const builder = queryBuilder("single", {
      data: null,
      error: {
        code: "23505",
        message: "duplicate key",
        details: null,
        hint: null,
      },
    });
    createClientMock.mockResolvedValue(
      authenticatedClient({ from: vi.fn().mockReturnValue(builder) }),
    );

    await expect(
      createOwnedCustomList({
        name: "Weekend Movies",
        description: null,
      }),
    ).rejects.toBeInstanceOf(ListsConflictError);
  });

  it("updates only the owned list and never accepts mutable ownership fields", async () => {
    const builder = queryBuilder("maybeSingle", {
      data: { ...listRow, name: "Best Thrillers" },
      error: null,
    });
    const from = vi.fn().mockReturnValue(builder);
    createClientMock.mockResolvedValue(authenticatedClient({ from }));

    await expect(
      updateOwnedCustomList({
        listId,
        name: "Best Thrillers",
        description: "Tense favourites",
      }),
    ).resolves.toMatchObject({ id: listId, name: "Best Thrillers" });

    expect(from).toHaveBeenCalledWith("lists");
    expect(builder.update).toHaveBeenCalledWith({
      name: "Best Thrillers",
      description: "Tense favourites",
    });
    expect(builder.update.mock.calls[0]?.[0]).not.toHaveProperty("user_id");
    expect(builder.update.mock.calls[0]?.[0]).not.toHaveProperty("visibility");
    expect(builder.eq).toHaveBeenNthCalledWith(1, "id", listId);
    expect(builder.eq).toHaveBeenNthCalledWith(2, "user_id", userId);
  });

  it("deletes only the confirmed owned lists row", async () => {
    const readBuilder = queryBuilder("maybeSingle", {
      data: listRow,
      error: null,
    });
    const deleteBuilder = queryBuilder("maybeSingle", {
      data: { id: listId },
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(readBuilder)
      .mockReturnValueOnce(deleteBuilder);
    createClientMock.mockResolvedValue(authenticatedClient({ from }));

    await expect(
      deleteOwnedCustomList(listId, "Weekend Movies"),
    ).resolves.toBe(true);

    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenNthCalledWith(1, "lists");
    expect(from).toHaveBeenNthCalledWith(2, "lists");
    expect(from).not.toHaveBeenCalledWith("list_movies");
    expect(from).not.toHaveBeenCalledWith("user_movies");
    expect(from).not.toHaveBeenCalledWith("movies");
    expect(deleteBuilder.delete).toHaveBeenCalledOnce();
    expect(deleteBuilder.eq).toHaveBeenNthCalledWith(1, "id", listId);
    expect(deleteBuilder.eq).toHaveBeenNthCalledWith(2, "user_id", userId);
  });

  it("does not delete when the confirmation name differs", async () => {
    const readBuilder = queryBuilder("maybeSingle", {
      data: listRow,
      error: null,
    });
    const from = vi.fn().mockReturnValue(readBuilder);
    createClientMock.mockResolvedValue(authenticatedClient({ from }));

    await expect(
      deleteOwnedCustomList(listId, "weekend movies"),
    ).rejects.toBeInstanceOf(ListsValidationError);
    expect(from).toHaveBeenCalledOnce();
    expect(readBuilder.delete).not.toHaveBeenCalled();
  });
});

describe("custom-list RPC boundaries", () => {
  it("submits list, membership, and user_movies IDs under their exact RPC parameter names", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rpcResult, error: null });
    createClientMock.mockResolvedValue(authenticatedClient({ rpc }));

    await addOwnedMoviesToList({
      listId,
      userMovieIds: [secondUserMovieId, userMovieId],
    });
    await moveOwnedCustomList(listId, "up");
    await moveOwnedListItem(listMovieId, "down");
    await removeOwnedListMovie(listMovieId);
    await setOwnedMovieListMemberships(userMovieId, [listId]);

    expect(rpc).toHaveBeenNthCalledWith(1, "watchflow_add_movies_to_list", {
      p_list_id: listId,
      p_user_movie_ids: [secondUserMovieId, userMovieId],
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "watchflow_move_custom_list", {
      p_list_id: listId,
      p_direction: "up",
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "watchflow_move_list_item", {
      p_list_movie_id: listMovieId,
      p_direction: "down",
    });
    expect(rpc).toHaveBeenNthCalledWith(
      4,
      "watchflow_remove_movie_from_list",
      { p_list_movie_id: listMovieId },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      5,
      "watchflow_set_movie_list_memberships",
      {
        p_user_movie_id: userMovieId,
        p_list_ids: [listId],
      },
    );

    for (const [, parameters] of rpc.mock.calls) {
      expect(parameters).not.toHaveProperty("user_id");
      expect(parameters).not.toHaveProperty("p_user_id");
      expect(parameters).not.toHaveProperty("movie_id");
      expect(parameters).not.toHaveProperty("tmdb_id");
    }
  });

  it("allows an empty selected-list array to remove all memberships safely", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rpcResult, error: null });
    createClientMock.mockResolvedValue(authenticatedClient({ rpc }));

    await setOwnedMovieListMemberships(userMovieId, []);

    expect(rpc).toHaveBeenCalledWith(
      "watchflow_set_movie_list_memberships",
      {
        p_user_movie_id: userMovieId,
        p_list_ids: [],
      },
    );
  });

  it.each([
    ["42P01", ListsMissingTableError],
    ["42703", ListsMissingColumnError],
    ["PGRST204", ListsSchemaCacheError],
    ["PGRST202", ListsMissingRpcError],
    ["42501", ListsAuthorizationError],
    ["22P02", ListsValidationError],
    ["23505", ListsPersistenceError],
    ["23503", ListsNotFoundError],
    ["XX000", ListsPersistenceError],
  ])("classifies Supabase error %s without returning raw details", async (code, ErrorClass) => {
    const providerError = {
      code,
      message: "raw database message",
      details: "private row details",
      hint: "provider hint",
    };
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: providerError,
    });
    createClientMock.mockResolvedValue(authenticatedClient({ rpc }));

    await expect(
      addOwnedMoviesToList({ listId, userMovieIds: [userMovieId] }),
    ).rejects.toBeInstanceOf(ErrorClass);
    expect(logSupabaseErrorMock).toHaveBeenCalledWith(
      "custom list batch append failed",
      providerError,
    );
  });

  it("rejects a malformed successful RPC response as a safe persistence error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { success: "yes", private_payload: "must not escape" },
      error: null,
    });
    createClientMock.mockResolvedValue(authenticatedClient({ rpc }));

    await expect(
      addOwnedMoviesToList({ listId, userMovieIds: [userMovieId] }),
    ).rejects.toMatchObject({
      name: "ListsPersistenceError",
      message: expect.not.stringContaining("private_payload"),
    });
  });
});
