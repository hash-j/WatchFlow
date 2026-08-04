import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logSupabaseError = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/error-logging", () => ({ logSupabaseError }));

import {
  MovieProviderError,
  MovieRateLimitConfigurationError,
} from "./errors";
import {
  enforceTmdbRateLimit,
  parseTmdbRateLimitResult,
} from "./rate-limit";

function clientWithResult(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return {
    client: { rpc } as unknown as SupabaseClient,
    rpc,
  };
}

beforeEach(() => {
  logSupabaseError.mockReset();
});

describe("TMDB rate-limit response parsing", () => {
  it("maps a complete database response", () => {
    expect(
      parseTmdbRateLimitResult({
        allowed: true,
        remaining: 29,
        retry_after_seconds: 0,
        limit: 30,
        window_seconds: 60,
      }),
    ).toEqual({
      allowed: true,
      remaining: 29,
      retryAfterSeconds: 0,
      limit: 30,
      windowSeconds: 60,
    });
  });

  it.each([
    null,
    [],
    { allowed: "yes" },
    {
      allowed: true,
      remaining: -1,
      retry_after_seconds: 0,
      limit: 30,
      window_seconds: 60,
    },
  ])("rejects malformed response %#", (value) => {
    expect(parseTmdbRateLimitResult(value)).toBeNull();
  });
});

describe("authenticated TMDB rate limiting", () => {
  it("consumes the selected operation without accepting a browser user ID", async () => {
    const { client, rpc } = clientWithResult({
      data: {
        allowed: true,
        remaining: 19,
        retry_after_seconds: 0,
        limit: 20,
        window_seconds: 60,
      },
      error: null,
    });

    await expect(enforceTmdbRateLimit(client, "details")).resolves.toMatchObject({
      allowed: true,
      remaining: 19,
    });
    expect(rpc).toHaveBeenCalledWith("watchflow_take_tmdb_rate_limit", {
      p_operation: "details",
      p_cost: 1,
    });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("user_id");
  });

  it("returns an accessible retry duration when the allowance is exhausted", async () => {
    const { client } = clientWithResult({
      data: {
        allowed: false,
        remaining: 0,
        retry_after_seconds: 17,
        limit: 30,
        window_seconds: 60,
      },
      error: null,
    });

    await expect(enforceTmdbRateLimit(client, "search")).rejects.toMatchObject({
      name: "MovieProviderRateLimitError",
      retryAfterSeconds: 17,
      message: "Too many movie requests. Try again in 17 seconds.",
    });
  });

  it("reports a missing Part 15 migration separately", async () => {
    const { client } = clientWithResult({
      data: null,
      error: {
        code: "PGRST202",
        message: "function was not found",
      },
    });

    await expect(enforceTmdbRateLimit(client, "search")).rejects.toBeInstanceOf(
      MovieRateLimitConfigurationError,
    );
    expect(logSupabaseError).toHaveBeenCalledOnce();
  });

  it("does not report an RPC permission failure as a missing migration", async () => {
    const { client } = clientWithResult({
      data: null,
      error: {
        code: "42501",
        message:
          "permission denied for function watchflow_take_tmdb_rate_limit",
      },
    });

    const failure = await enforceTmdbRateLimit(client, "search").catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(MovieProviderError);
    expect(failure).not.toBeInstanceOf(MovieRateLimitConfigurationError);
    expect(failure).toMatchObject({
      message: "Movie requests are temporarily unavailable. Please try again.",
    });
  });

  it.each([
    { code: "42883", message: "function does not exist" },
    {
      code: "PGRST202",
      message: "Could not find the function in the schema cache",
    },
    {
      code: "",
      message:
        "Could not find the function public.watchflow_take_tmdb_rate_limit",
    },
  ])("recognizes a genuine missing RPC response %#", async (error) => {
    const { client } = clientWithResult({ data: null, error });

    await expect(enforceTmdbRateLimit(client, "search")).rejects.toBeInstanceOf(
      MovieRateLimitConfigurationError,
    );
  });

  it("fails closed on malformed or unexpected database responses", async () => {
    const malformed = clientWithResult({ data: { allowed: true }, error: null });
    await expect(
      enforceTmdbRateLimit(malformed.client, "import_search"),
    ).rejects.toBeInstanceOf(MovieProviderError);

    const databaseFailure = clientWithResult({
      data: null,
      error: { code: "57014", message: "query cancelled" },
    });
    await expect(
      enforceTmdbRateLimit(databaseFailure.client, "import_search"),
    ).rejects.toBeInstanceOf(MovieProviderError);
  });

  it.each([0, -1, 21, 1.5, null])(
    "rejects invalid request cost %s before calling the database",
    async (cost) => {
      const { client, rpc } = clientWithResult({ data: null, error: null });
      await expect(
        enforceTmdbRateLimit(client, "search", cost as number),
      ).rejects.toBeInstanceOf(MovieProviderError);
      expect(rpc).not.toHaveBeenCalled();
    },
  );
});
