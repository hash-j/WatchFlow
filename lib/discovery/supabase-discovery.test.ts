import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
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
  DiscoveryAuthenticationError,
  DiscoveryAuthorizationError,
  DiscoveryPersistenceError,
  DiscoveryRelationshipError,
  DiscoverySchemaError,
} from "./errors";
import {
  DISCOVERY_LIBRARY_SELECT,
  getDiscoveryDataset,
  MAX_DISCOVERY_LIBRARY_ROWS,
  queryOwnedDiscoveryDataset,
} from "./supabase-discovery";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "want_to_watch",
  favourite: false,
  personal_rating: null,
  movies: {
    id: 42,
    title: "Inception",
    original_title: "Inception",
    poster_path: "/poster.jpg",
    release_year: 2010,
    runtime_minutes: 148,
    genres: ["Science Fiction", "Thriller"],
    director: "Christopher Nolan",
    public_rating: 8.4,
  },
};

function createQueryClient(result: {
  data: unknown;
  count: number | null;
  error: unknown;
}) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn().mockResolvedValue(result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);

  const from = vi.fn().mockReturnValue(builder);

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    builder,
  };
}

beforeEach(() => {
  createClientMock.mockReset();
  logSupabaseErrorMock.mockReset();
});

describe("private discovery dataset query", () => {
  it("uses an exact-column, exact-count, owner-filtered, stably bounded query", async () => {
    const { client, from, builder } = createQueryClient({
      data: [row],
      count: 1,
      error: null,
    });

    await queryOwnedDiscoveryDataset(client, "verified-user-id");

    expect(from).toHaveBeenCalledWith("user_movies");
    expect(builder.select).toHaveBeenCalledWith(DISCOVERY_LIBRARY_SELECT, {
      count: "exact",
    });
    expect(DISCOVERY_LIBRARY_SELECT).toBe(
      "id,status,favourite,personal_rating,movies!inner(id,title,original_title,poster_path,release_year,runtime_minutes,genres,director,public_rating)",
    );
    expect(DISCOVERY_LIBRARY_SELECT).not.toMatch(/(^|[,(\s])user_id([,)\s]|$)/);
    expect(builder.eq).toHaveBeenCalledWith("user_id", "verified-user-id");
    expect(builder.order).toHaveBeenNthCalledWith(1, "created_at", {
      ascending: false,
    });
    expect(builder.order).toHaveBeenNthCalledWith(2, "id", {
      ascending: true,
    });
    expect(builder.range).toHaveBeenCalledWith(
      0,
      MAX_DISCOVERY_LIBRARY_ROWS - 1,
    );
  });

  it("returns the exact total and reports a bounded dataset honestly", async () => {
    const { client } = createQueryClient({
      data: [row],
      count: 1007,
      error: null,
    });

    await expect(
      queryOwnedDiscoveryDataset(client, "verified-user-id"),
    ).resolves.toMatchObject({
      movies: [expect.objectContaining({ userMovieId: row.id })],
      totalCount: 1007,
      truncated: true,
    });
  });

  it("falls back safely when PostgREST omits the requested count", async () => {
    const { client } = createQueryClient({
      data: [row],
      count: null,
      error: null,
    });

    await expect(
      queryOwnedDiscoveryDataset(client, "verified-user-id"),
    ).resolves.toMatchObject({
      totalCount: 1,
      truncated: false,
    });
  });

  it.each([
    ["PGRST301", DiscoveryAuthenticationError],
    ["42703", DiscoverySchemaError],
    ["PGRST200", DiscoveryRelationshipError],
    ["42501", DiscoveryAuthorizationError],
    ["XX000", DiscoveryPersistenceError],
  ])("maps %s without exposing the database message", async (code, ErrorType) => {
    const databaseError = {
      code,
      message: "private raw database message",
      details: "private details",
      hint: "private hint",
    };
    const { client } = createQueryClient({
      data: null,
      count: null,
      error: databaseError,
    });

    await expect(
      queryOwnedDiscoveryDataset(client, "verified-user-id"),
    ).rejects.toBeInstanceOf(ErrorType);
    expect(logSupabaseErrorMock).toHaveBeenCalledWith(
      "private discovery library query failed",
      databaseError,
    );
  });
});

describe("discovery authentication boundary", () => {
  it("has no browser owner argument or admin-client dependency", () => {
    const source = readFileSync(
      new URL("./supabase-discovery.ts", import.meta.url),
      "utf8",
    );

    expect(getDiscoveryDataset).toHaveLength(0);
    expect(source).not.toContain("createAdminClient");
    expect(source).not.toContain("FormData");
    expect(source).not.toContain("p_user_id");
  });

  it("uses a fresh authenticated user and never accepts an owner from input", async () => {
    const { client, builder } = createQueryClient({
      data: [row],
      count: 1,
      error: null,
    });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "fresh-auth-user-id" } },
      error: null,
    });
    const authenticatedClient = {
      ...client,
      auth: { getUser },
    };
    createClientMock.mockResolvedValue(authenticatedClient);

    await expect(getDiscoveryDataset()).resolves.toMatchObject({
      totalCount: 1,
    });

    expect(getUser).toHaveBeenCalledOnce();
    expect(builder.eq).toHaveBeenCalledWith("user_id", "fresh-auth-user-id");
  });

  it("rejects a missing or expired session before querying private rows", async () => {
    const from = vi.fn();
    const authenticationError = {
      code: "bad_jwt",
      message: "session expired",
    };
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: authenticationError,
        }),
      },
      from,
    });

    await expect(getDiscoveryDataset()).rejects.toBeInstanceOf(
      DiscoveryAuthenticationError,
    );
    expect(from).not.toHaveBeenCalled();
    expect(logSupabaseErrorMock).toHaveBeenCalledWith(
      "discovery authentication failed",
      authenticationError,
    );
  });
});
