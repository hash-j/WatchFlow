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
  createSupabaseManagementDependencies,
  scheduleAuthenticatedUserMovie,
  updateAuthenticatedUserMovie,
} from "./supabase-management";
import type { ValidatedMovieManagement } from "./management";
import {
  LibraryAuthorizationError,
  LibraryConstraintError,
  LibrarySchemaError,
} from "./errors";

const input: ValidatedMovieManagement = {
  status: "want_to_watch",
  personalRating: 8.5,
  review: null,
  priority: 0,
  wouldWatchAgain: false,
  watchedAt: null,
  scheduledFor: null,
  timezone: null,
  scheduleNote: null,
};

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };

  builder.select.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.not.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);

  return builder;
}

beforeEach(() => {
  createClientMock.mockReset();
});

describe("authenticated Supabase movie updates", () => {
  it("verifies authentication with auth.getUser", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "verified-user-id" } },
      error: null,
    });
    createClientMock.mockResolvedValue({ auth: { getUser } });

    const session = await createSupabaseManagementDependencies().authenticate();

    expect(getUser).toHaveBeenCalledOnce();
    expect(session).toEqual(
      expect.objectContaining({ userId: "verified-user-id" }),
    );
  });

  it("does not update a row that is not owned by the authenticated user", async () => {
    const lookup = createBuilder({ data: null, error: null });
    const from = vi.fn().mockReturnValue(lookup);
    const client = { from } as unknown as SupabaseClient;

    await expect(
      updateAuthenticatedUserMovie(
        client,
        "verified-user-id",
        "another-users-row-id",
        input,
      ),
    ).resolves.toBe(false);

    expect(lookup.eq).toHaveBeenNthCalledWith(1, "id", "another-users-row-id");
    expect(lookup.eq).toHaveBeenNthCalledWith(2, "user_id", "verified-user-id");
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("updates a matching row with normalized values and both ownership filters", async () => {
    const lookup = createBuilder({
      data: {
        id: "owned-row-id",
        status: "want_to_watch",
        queue_position: null,
      },
      error: null,
    });
    const update = createBuilder({
      data: {
        id: "owned-row-id",
        status: "want_to_watch",
        personal_rating: 8.5,
        review: null,
        priority: 0,
        watched_at: null,
        would_watch_again: false,
      },
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(lookup)
      .mockReturnValueOnce(update);
    const client = { from } as unknown as SupabaseClient;

    await expect(
      updateAuthenticatedUserMovie(
        client,
        "verified-user-id",
        "owned-row-id",
        input,
      ),
    ).resolves.toBe(true);

    expect(update.update).toHaveBeenCalledWith({
      status: "want_to_watch",
      personal_rating: 8.5,
      review: null,
      priority: 0,
      watched_at: null,
      would_watch_again: false,
      queue_position: null,
      scheduled_for: null,
    });
    expect(update.eq).toHaveBeenNthCalledWith(1, "id", "owned-row-id");
    expect(update.eq).toHaveBeenNthCalledWith(2, "user_id", "verified-user-id");
    expect(update.select).toHaveBeenCalledWith(
      "id, status, personal_rating, review, priority, watched_at, would_watch_again",
    );
  });

  it("reports an explicit RLS authorization failure", async () => {
    const lookup = createBuilder({
      data: null,
      error: { code: "42501", message: "row-level security policy violation" },
    });
    const client = {
      from: vi.fn().mockReturnValue(lookup),
    } as unknown as SupabaseClient;

    await expect(
      updateAuthenticatedUserMovie(
        client,
        "verified-user-id",
        "owned-row-id",
        input,
      ),
    ).rejects.toBeInstanceOf(LibraryAuthorizationError);
  });

  it("reports database constraint failures separately", async () => {
    const lookup = createBuilder({
      data: {
        id: "owned-row-id",
        status: "want_to_watch",
        queue_position: null,
      },
      error: null,
    });
    const update = createBuilder({
      data: null,
      error: { code: "23514", message: "check constraint violation" },
    });
    const client = {
      from: vi.fn().mockReturnValueOnce(lookup).mockReturnValueOnce(update),
    } as unknown as SupabaseClient;

    await expect(
      updateAuthenticatedUserMovie(
        client,
        "verified-user-id",
        "owned-row-id",
        input,
      ),
    ).rejects.toBeInstanceOf(LibraryConstraintError);
  });

  it("schedules only an owned user_movies row with normalized columns", async () => {
    const lookup = createBuilder({
      data: { id: "owned-row-id", movie_id: 42, status: "want_to_watch" },
      error: null,
    });
    const update = createBuilder({
      data: {
        id: "owned-row-id",
        movie_id: 42,
        status: "scheduled",
        scheduled_for: "2099-07-22T14:30:00.000Z",
        schedule_timezone: "Asia/Karachi",
        schedule_note: null,
      },
      error: null,
    });
    const profile = createBuilder({ data: null, error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(lookup)
      .mockReturnValueOnce(update)
      .mockReturnValueOnce(profile);
    const client = { from } as unknown as SupabaseClient;

    await expect(
      scheduleAuthenticatedUserMovie(
        client,
        "verified-user-id",
        "owned-row-id",
        {
          scheduledFor: "2099-07-22T14:30:00.000Z",
          timezone: "Asia/Karachi",
          scheduleNote: null,
        },
      ),
    ).resolves.toEqual({ movieId: "42" });

    expect(update.update).toHaveBeenCalledWith({
      status: "scheduled",
      scheduled_for: "2099-07-22T14:30:00.000Z",
      schedule_timezone: "Asia/Karachi",
      schedule_note: null,
      queue_position: null,
    });
    expect(update.eq).toHaveBeenNthCalledWith(1, "id", "owned-row-id");
    expect(update.eq).toHaveBeenNthCalledWith(2, "user_id", "verified-user-id");
  });

  it("does not schedule another user's movie", async () => {
    const lookup = createBuilder({ data: null, error: null });
    const from = vi.fn().mockReturnValue(lookup);
    const client = { from } as unknown as SupabaseClient;

    await expect(
      scheduleAuthenticatedUserMovie(
        client,
        "verified-user-id",
        "another-users-row-id",
        {
          scheduledFor: "2099-07-22T14:30:00.000Z",
          timezone: "Asia/Karachi",
          scheduleNote: null,
        },
      ),
    ).resolves.toBeNull();
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("reports missing scheduling columns explicitly", async () => {
    const lookup = createBuilder({
      data: { id: "owned-row-id", movie_id: 42, status: "want_to_watch" },
      error: null,
    });
    const update = createBuilder({
      data: null,
      error: {
        code: "PGRST204",
        message: "Could not find the schedule_timezone column",
      },
    });
    const client = {
      from: vi.fn().mockReturnValueOnce(lookup).mockReturnValueOnce(update),
    } as unknown as SupabaseClient;

    await expect(
      scheduleAuthenticatedUserMovie(
        client,
        "verified-user-id",
        "owned-row-id",
        {
          scheduledFor: "2099-07-22T14:30:00.000Z",
          timezone: "Asia/Karachi",
          scheduleNote: null,
        },
      ),
    ).rejects.toBeInstanceOf(LibrarySchemaError);
  });

  it("calls the atomic queue RPC without a browser user ID", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { success: true, moved: true, position: 2 },
      error: null,
    });
    const dependencies = createSupabaseManagementDependencies();

    await expect(
      dependencies.moveQueueMovie(
        {
          userId: "verified-user-id",
          client: { rpc },
        },
        "owned-row-id",
        "down",
      ),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("move_watch_queue_item", {
      p_user_movie_id: "owned-row-id",
      p_direction: "down",
    });
  });

  it("refuses a queue item that is not owned by the RPC caller", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { success: false, moved: false, reason: "not_found" },
      error: null,
    });
    const dependencies = createSupabaseManagementDependencies();

    await expect(
      dependencies.moveQueueMovie(
        { userId: "verified-user-id", client: { rpc } },
        "another-users-row-id",
        "up",
      ),
    ).resolves.toBe(false);
  });
});
