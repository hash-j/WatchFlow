import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({ createClient: createClientMock }));
vi.mock("../supabase/error-logging", () => ({
  logSupabaseError: vi.fn(),
}));

import {
  LibraryAuthorizationError,
  LibrarySchemaError,
} from "./errors";
import { createSupabaseLibraryMutationDependencies } from "./supabase-mutations";

const libraryId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

function createUpdateBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  builder.update.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  createClientMock.mockReset();
});

describe("Supabase favourite persistence", () => {
  it("verifies the current user with auth.getUser", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "verified-user-id" } },
      error: null,
    });
    createClientMock.mockResolvedValue({ auth: { getUser } });

    const session =
      await createSupabaseLibraryMutationDependencies().authenticate();

    expect(getUser).toHaveBeenCalledOnce();
    expect(session).toEqual(
      expect.objectContaining({ userId: "verified-user-id" }),
    );
  });

  it("updates favourite only on an owned user_movies row", async () => {
    const builder = createUpdateBuilder({
      data: { id: libraryId },
      error: null,
    });
    const from = vi.fn().mockReturnValue(builder);
    const client = { from } as unknown as SupabaseClient;
    const dependencies = createSupabaseLibraryMutationDependencies();

    await expect(
      dependencies.setFavourite(
        { userId: "verified-user-id", client },
        libraryId,
        true,
      ),
    ).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith("user_movies");
    expect(from).not.toHaveBeenCalledWith("movies");
    expect(builder.update).toHaveBeenCalledWith({ favourite: true });
    expect(builder.eq).toHaveBeenNthCalledWith(1, "id", libraryId);
    expect(builder.eq).toHaveBeenNthCalledWith(
      2,
      "user_id",
      "verified-user-id",
    );
  });

  it("does not favourite another user's or a missing record", async () => {
    const builder = createUpdateBuilder({ data: null, error: null });
    const client = {
      from: vi.fn().mockReturnValue(builder),
    } as unknown as SupabaseClient;

    await expect(
      createSupabaseLibraryMutationDependencies().setFavourite(
        { userId: "verified-user-id", client },
        libraryId,
        true,
      ),
    ).resolves.toBe(false);
  });

  it("reports a missing favourite column as a migration requirement", async () => {
    const builder = createUpdateBuilder({
      data: null,
      error: { code: "42703", message: "column favourite does not exist" },
    });
    const client = {
      from: vi.fn().mockReturnValue(builder),
    } as unknown as SupabaseClient;

    await expect(
      createSupabaseLibraryMutationDependencies().setFavourite(
        { userId: "verified-user-id", client },
        libraryId,
        true,
      ),
    ).rejects.toBeInstanceOf(LibrarySchemaError);
  });
});

describe("Supabase bulk library RPCs", () => {
  it("updates owned records through an authenticated RPC with no browser user ID", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        success: true,
        requested: 2,
        matched: 2,
        updated: 2,
        skipped: 0,
        failed: 0,
      },
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient;

    await expect(
      createSupabaseLibraryMutationDependencies().bulkUpdateStatus(
        { userId: "verified-user-id", client },
        [libraryId, secondId],
        "watched",
      ),
    ).resolves.toEqual({
      success: true,
      requested: 2,
      matched: 2,
      affected: 2,
      skipped: 0,
      failed: 0,
      reason: null,
    });

    expect(rpc).toHaveBeenCalledWith(
      "watchflow_bulk_update_library_status",
      {
        p_user_movie_ids: [libraryId, secondId],
        p_status: "watched",
      },
    );
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("user_id");
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_user_id");
  });

  it("reports ownership or stale-selection mismatches honestly", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          success: false,
          requested: 2,
          matched: 1,
          updated: 0,
          skipped: 1,
          failed: 0,
          reason: "selection_changed",
        },
        error: null,
      }),
    } as unknown as SupabaseClient;

    await expect(
      createSupabaseLibraryMutationDependencies().bulkUpdateStatus(
        { userId: "verified-user-id", client },
        [libraryId, secondId],
        "watched",
      ),
    ).resolves.toMatchObject({
      success: false,
      affected: 0,
      skipped: 1,
      reason: "selection_changed",
    });
  });

  it("deletes only user_movies IDs through the authenticated bulk RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        success: true,
        requested: 1,
        matched: 1,
        deleted: 1,
        skipped: 0,
        failed: 0,
      },
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient;

    await expect(
      createSupabaseLibraryMutationDependencies().removeUserMovies(
        { userId: "verified-user-id", client },
        [libraryId],
      ),
    ).resolves.toMatchObject({ success: true, affected: 1 });
    expect(rpc).toHaveBeenCalledWith(
      "watchflow_bulk_remove_library_movies",
      { p_user_movie_ids: [libraryId] },
    );
  });

  it("maps RLS and missing-RPC failures to safe domain errors", async () => {
    const unauthorized = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS rejected" },
      }),
    } as unknown as SupabaseClient;
    const missing = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST202", message: "function not found" },
      }),
    } as unknown as SupabaseClient;
    const dependencies = createSupabaseLibraryMutationDependencies();

    await expect(
      dependencies.removeUserMovies(
        { userId: "verified-user-id", client: unauthorized },
        [libraryId],
      ),
    ).rejects.toBeInstanceOf(LibraryAuthorizationError);
    await expect(
      dependencies.removeUserMovies(
        { userId: "verified-user-id", client: missing },
        [libraryId],
      ),
    ).rejects.toBeInstanceOf(LibrarySchemaError);
  });
});
