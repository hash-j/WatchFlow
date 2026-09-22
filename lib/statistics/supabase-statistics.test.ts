import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthContextMock, logSupabaseErrorMock } = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  logSupabaseErrorMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/auth", () => ({
  getAuthContext: getAuthContextMock,
}));
vi.mock("@/lib/supabase/error-logging", () => ({
  logSupabaseError: logSupabaseErrorMock,
}));

import {
  getSafeStatisticsErrorMessage,
  StatisticsAuthenticationError,
  StatisticsAuthorizationError,
  StatisticsPersistenceError,
  StatisticsRelationshipError,
  StatisticsSchemaError,
} from "./errors";
import {
  getPersonalStatistics,
  MAX_STATISTICS_LIBRARY_ROWS,
  queryOwnedStatisticsDataset,
  queryOwnedStatisticsTimezone,
  STATISTICS_LIBRARY_SELECT,
  throwStatisticsQueryError,
} from "./supabase-statistics";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "watched",
  favourite: true,
  personal_rating: 8.5,
  watched_at: "2026-08-01T00:00:00.000Z",
  scheduled_for: null,
  movies: {
    id: 42,
    title: "Inception",
    poster_path: "/poster.jpg",
    release_year: 2010,
    runtime_minutes: 148,
    genres: ["Science Fiction", "Thriller"],
  },
};

function createDatasetBuilder(result: {
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
  return builder;
}

function createTimezoneBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  getAuthContextMock.mockReset();
  logSupabaseErrorMock.mockReset();
});

describe("owned Statistics query contract", () => {
  it("uses one exact-column, exact-count, owner-filtered, stably bounded library query", async () => {
    const builder = createDatasetBuilder({ data: [row], count: 1, error: null });
    const from = vi.fn().mockReturnValue(builder);
    const client = { from } as unknown as SupabaseClient;

    await queryOwnedStatisticsDataset(client, "verified-user-id");

    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("user_movies");
    expect(builder.select).toHaveBeenCalledWith(STATISTICS_LIBRARY_SELECT, {
      count: "exact",
    });
    expect(STATISTICS_LIBRARY_SELECT).toBe(
      "id,status,favourite,personal_rating,watched_at,scheduled_for,movies!inner(id,title,poster_path,release_year,runtime_minutes,genres)",
    );
    expect(STATISTICS_LIBRARY_SELECT).not.toMatch(
      /(^|[,()\s])user_id([,()\s]|$)/,
    );
    expect(builder.eq).toHaveBeenCalledWith("user_id", "verified-user-id");
    expect(builder.order).toHaveBeenNthCalledWith(1, "created_at", {
      ascending: false,
    });
    expect(builder.order).toHaveBeenNthCalledWith(2, "id", {
      ascending: true,
    });
    expect(builder.range).toHaveBeenCalledWith(
      0,
      MAX_STATISTICS_LIBRARY_ROWS - 1,
    );
  });

  it("returns exact coverage and reports a bounded dataset honestly", async () => {
    const builder = createDatasetBuilder({ data: [row], count: 1007, error: null });
    const client = {
      from: vi.fn().mockReturnValue(builder),
    } as unknown as SupabaseClient;

    await expect(
      queryOwnedStatisticsDataset(client, "verified-user-id"),
    ).resolves.toMatchObject({
      movies: [expect.objectContaining({ userMovieId: row.id })],
      totalCount: 1007,
      truncated: true,
    });
  });

  it("falls back to mapped length when PostgREST omits its requested count", async () => {
    const builder = createDatasetBuilder({ data: [row], count: null, error: null });
    const client = {
      from: vi.fn().mockReturnValue(builder),
    } as unknown as SupabaseClient;

    await expect(
      queryOwnedStatisticsDataset(client, "verified-user-id"),
    ).resolves.toMatchObject({ totalCount: 1, truncated: false });
  });

  it("loads profile timezone through the same authenticated owner boundary", async () => {
    const builder = createTimezoneBuilder({
      data: { timezone: "Asia/Karachi" },
      error: null,
    });
    const from = vi.fn().mockReturnValue(builder);

    await expect(
      queryOwnedStatisticsTimezone(
        { from } as unknown as SupabaseClient,
        "verified-user-id",
      ),
    ).resolves.toBe("Asia/Karachi");

    expect(from).toHaveBeenCalledWith("profiles");
    expect(builder.select).toHaveBeenCalledWith("timezone");
    expect(builder.eq).toHaveBeenCalledWith("id", "verified-user-id");
    expect(builder.maybeSingle).toHaveBeenCalledOnce();
  });

  it("normalizes a missing or invalid profile timezone to UTC", async () => {
    for (const timezone of [null, "Not/A_Timezone"]) {
      const builder = createTimezoneBuilder({ data: { timezone }, error: null });
      const client = {
        from: vi.fn().mockReturnValue(builder),
      } as unknown as SupabaseClient;

      await expect(
        queryOwnedStatisticsTimezone(client, "verified-user-id"),
      ).resolves.toBe("UTC");
    }
  });
});

describe("Statistics authentication and user isolation", () => {
  it("accepts no owner input and applies the request identity to private rows", async () => {
    const dataset = createDatasetBuilder({ data: [row], count: 1, error: null });
    const from = vi.fn().mockReturnValue(dataset);
    getAuthContextMock.mockResolvedValue({
      client: { from },
      profile: { timezone: "UTC" },
      user: { id: "request-auth-user-id" },
    });

    expect(getPersonalStatistics).toHaveLength(0);
    await expect(getPersonalStatistics()).resolves.toMatchObject({
      summary: { totalMovies: 1, watchedMovies: 1 },
    });

    expect(getAuthContextMock).toHaveBeenCalledOnce();
    expect(dataset.eq).toHaveBeenCalledWith("user_id", "request-auth-user-id");
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing or expired session before any private table query", async () => {
    getAuthContextMock.mockRejectedValue(new StatisticsAuthenticationError());

    await expect(getPersonalStatistics()).rejects.toBeInstanceOf(
      StatisticsAuthenticationError,
    );
    expect(getAuthContextMock).toHaveBeenCalledOnce();
  });

  it("contains no browser owner argument, admin client, or global private cache", () => {
    const source = readFileSync(
      new URL("./supabase-statistics.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain('import "server-only"');
    for (const forbidden of [
      "createAdminClient",
      "FormData",
      "p_user_id",
      "unstable_cache",
      "revalidateTag",
      "tmdb-provider",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

describe("safe Statistics errors", () => {
  it.each([
    ["PGRST301", StatisticsAuthenticationError],
    ["PGRST302", StatisticsAuthenticationError],
    ["42P01", StatisticsSchemaError],
    ["42703", StatisticsSchemaError],
    ["PGRST204", StatisticsSchemaError],
    ["PGRST200", StatisticsRelationshipError],
    ["PGRST201", StatisticsRelationshipError],
    ["42501", StatisticsAuthorizationError],
    ["XX000", StatisticsPersistenceError],
  ])("maps %s to a controlled error class", (code, ErrorType) => {
    const rawError = {
      code,
      message: "private raw database message",
      details: "private movie titles",
      hint: "private database hint",
    };

    expect(() =>
      throwStatisticsQueryError("private statistics query failed", rawError),
    ).toThrow(ErrorType);
    expect(logSupabaseErrorMock).toHaveBeenCalledWith(
      "private statistics query failed",
      rawError,
    );

    try {
      throwStatisticsQueryError("private statistics query failed", rawError);
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorType);
      expect(String((error as Error).message)).not.toContain("private raw");
      expect(String((error as Error).message)).not.toContain("private movie");
    }
  });

  it("maps custom and unknown errors to fixed safe UI copy", () => {
    const raw = "private raw database message with another user's movie";

    for (const error of [
      new StatisticsAuthenticationError(raw),
      new StatisticsSchemaError(raw),
      new StatisticsRelationshipError(raw),
      new StatisticsAuthorizationError(raw),
      new StatisticsPersistenceError(raw),
      new Error(raw),
    ]) {
      const message = getSafeStatisticsErrorMessage(error);
      expect(message).not.toContain(raw);
      expect(message).not.toMatch(/database|stack|token|cookie/i);
    }
  });
});
