import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readUserPreferencesMock } = vi.hoisted(() => ({
  readUserPreferencesMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/settings/supabase-settings", () => ({
  readUserPreferences: readUserPreferencesMock,
}));
vi.mock("@/lib/supabase/error-logging", () => ({
  logSupabaseError: vi.fn(),
}));

import { readDashboardData, readSchedulePageData } from "./supabase-overview";

type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

function createBuilder(result: QueryResult) {
  const builder = {
    ...result,
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    not: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };

  for (const method of [
    builder.select,
    builder.eq,
    builder.gte,
    builder.lte,
    builder.not,
    builder.is,
    builder.order,
    builder.limit,
  ]) {
    method.mockReturnValue(builder);
  }

  return builder;
}

function movieRow(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    status: "want_to_watch",
    movies: { id: `movie-${id}`, tmdb_id: 1, title: id },
    ...overrides,
  };
}

beforeEach(() => {
  readUserPreferencesMock.mockReset();
  readUserPreferencesMock.mockResolvedValue({ dateFormat: "mdy" });
});

describe("dashboard targeted reads", () => {
  it("uses owner-scoped minimal queries and bounded widget results", async () => {
    const builders = [
      createBuilder({ data: null, count: 9, error: null }),
      createBuilder({ data: [movieRow("next", { status: "watch_next" })], error: null }),
      createBuilder({
        data: [
          movieRow("today", {
            status: "scheduled",
            scheduled_for: "2026-09-21T15:00:00.000Z",
            schedule_timezone: "Asia/Karachi",
          }),
          movieRow("tomorrow", {
            status: "scheduled",
            scheduled_for: "2026-09-22T15:00:00.000Z",
            schedule_timezone: "Asia/Karachi",
          }),
        ],
        error: null,
      }),
      createBuilder({ data: [movieRow("recent")], error: null }),
      createBuilder({
        data: [
          movieRow("watched-date", {
            status: "watched",
            watched_at: "2026-09-19T00:00:00.000Z",
            updated_at: "2026-09-20T00:00:00.000Z",
          }),
        ],
        error: null,
      }),
      createBuilder({
        data: [
          movieRow("watched-fallback", {
            status: "watched",
            watched_at: null,
            updated_at: "2026-09-21T00:00:00.000Z",
          }),
        ],
        error: null,
      }),
    ];
    const from = vi.fn(() => builders.shift());
    const client = { from } as unknown as SupabaseClient;

    const result = await readDashboardData(
      client,
      "verified-user-id",
      "Asia/Karachi",
      new Date("2026-09-21T12:00:00.000Z"),
    );

    expect(from).toHaveBeenCalledTimes(6);
    expect(from).toHaveBeenCalledWith("user_movies");
    expect(result.libraryCount).toBe(9);
    expect(result.nextMovie.map((item) => item.libraryId)).toEqual(["next"]);
    expect(result.scheduledToday.map((item) => item.libraryId)).toEqual(["today"]);
    expect(result.recentlyAdded.map((item) => item.libraryId)).toEqual(["recent"]);
    expect(result.recentlyWatched.map((item) => item.libraryId)).toEqual([
      "watched-fallback",
      "watched-date",
    ]);
    expect(readUserPreferencesMock).toHaveBeenCalledWith(
      client,
      "verified-user-id",
    );

    for (const builder of builders) {
      expect(builder).toBeDefined();
    }
  });

  it("limits the next, recent, and watched candidate queries", async () => {
    const created = Array.from({ length: 6 }, () =>
      createBuilder({ data: [], count: 0, error: null }),
    );
    const pending = [...created];
    const client = {
      from: vi.fn(() => pending.shift()),
    } as unknown as SupabaseClient;

    await readDashboardData(
      client,
      "verified-user-id",
      "UTC",
      new Date("2026-09-21T12:00:00.000Z"),
    );

    expect(created[1].limit).toHaveBeenCalledWith(1);
    expect(created[3].limit).toHaveBeenCalledWith(4);
    expect(created[4].limit).toHaveBeenCalledWith(4);
    expect(created[5].limit).toHaveBeenCalledWith(4);
    expect(created[2].eq).toHaveBeenCalledWith("status", "scheduled");
    expect(created[2].gte).toHaveBeenCalledWith(
      "scheduled_for",
      expect.any(String),
    );
    expect(created[2].lte).toHaveBeenCalledWith(
      "scheduled_for",
      expect.any(String),
    );
    for (const builder of created) {
      expect(builder.select.mock.calls[0]?.[0]).not.toContain("*");
      expect(builder.eq).toHaveBeenCalledWith("user_id", "verified-user-id");
    }
  });
});

describe("schedule targeted reads", () => {
  it("separates scheduled display data from minimal selector data", async () => {
    const scheduled = createBuilder({
      data: [
        movieRow("scheduled", {
          status: "scheduled",
          scheduled_for: "2099-09-21T15:00:00.000Z",
          schedule_timezone: "Asia/Karachi",
          schedule_note: "Movie night",
        }),
      ],
      error: null,
    });
    const options = createBuilder({
      data: [
        { id: "option-1", created_at: "2026-09-21", movies: { id: "movie-1", title: "One" } },
      ],
      error: null,
    });
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(scheduled)
        .mockReturnValueOnce(options),
    } as unknown as SupabaseClient;

    const result = await readSchedulePageData(client, "verified-user-id");

    expect(result.scheduledMovies).toHaveLength(1);
    expect(result.movieOptions).toEqual([
      { libraryId: "option-1", title: "One" },
    ]);
    expect(scheduled.select).toHaveBeenCalledWith(
      "id, status, scheduled_for, schedule_timezone, schedule_note, movies(id, tmdb_id, title)",
    );
    expect(scheduled.eq).toHaveBeenCalledWith("status", "scheduled");
    expect(scheduled.not).toHaveBeenCalledWith("scheduled_for", "is", null);
    expect(options.select).toHaveBeenCalledWith(
      "id, created_at, movies(id, title)",
    );
    expect(options.select.mock.calls[0][0]).not.toContain("*");
    expect(options.eq).toHaveBeenCalledWith("user_id", "verified-user-id");
  });
});
