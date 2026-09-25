import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, readSnapshotsMock, createNotificationMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  readSnapshotsMock: vi.fn(),
  createNotificationMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({ createClient: createClientMock }));
vi.mock("../supabase/error-logging", () => ({
  logSupabaseError: vi.fn(),
}));
vi.mock("../notifications/supabase-notifications", () => ({
  readOwnedMovieStatusTransitionSnapshots: readSnapshotsMock,
  createMovieStatusTransitionNotification: createNotificationMock,
  isMovieStatusNotificationTarget: (status: string) =>
    ["watch_next", "currently_watching", "watched"].includes(status),
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
  watchedAtProvided: false,
  scheduledFor: null,
  timezone: null,
  scheduleNote: null,
  preservePersonalRating: false,
  preservePriority: false,
  preserveWouldWatchAgain: false,
};

beforeEach(() => {
  createClientMock.mockReset();
  readSnapshotsMock.mockReset().mockResolvedValue([]);
  createNotificationMock.mockReset().mockResolvedValue({
    id: "notification-id",
    created: true,
  });
});

describe("authenticated Supabase movie updates", () => {
  it("creates a notification only after a successful owned status transition", async () => {
    const snapshot = {
      userMovieId: "owned-row-id",
      status: "scheduled",
      updatedAt: "2026-09-24T10:00:00.000Z",
      movieTitle: "Arrival",
    };
    readSnapshotsMock.mockResolvedValue([snapshot]);
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as unknown as SupabaseClient;

    await expect(
      createSupabaseManagementDependencies().updateMovie(
        { userId: "verified-user-id", client } as never,
        "owned-row-id",
        { ...input, status: "currently_watching" },
      ),
    ).resolves.toBe(true);

    expect(readSnapshotsMock).toHaveBeenCalledWith(
      client,
      "verified-user-id",
      ["owned-row-id"],
    );
    expect(createNotificationMock).toHaveBeenCalledWith({
      verifiedUserId: "verified-user-id",
      snapshot,
      nextStatus: "currently_watching",
    });

    client.rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    createNotificationMock.mockClear();
    await createSupabaseManagementDependencies().updateMovie(
      { userId: "verified-user-id", client } as never,
      "another-users-row-id",
      { ...input, status: "currently_watching" },
    );
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

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

  it("returns false when the atomic ownership-scoped RPC finds no row", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const client = { rpc } as unknown as SupabaseClient;

    await expect(
      updateAuthenticatedUserMovie(
        client,
        "verified-user-id",
        "another-users-row-id",
        input,
      ),
    ).resolves.toBe(false);

    expect(rpc).toHaveBeenCalledWith(
      "watchflow_update_library_movie_v2",
      expect.objectContaining({ p_library_id: "another-users-row-id" }),
    );
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("user_id");
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_user_id");
  });

  it("sends normalized values to one atomic management RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = { rpc } as unknown as SupabaseClient;

    await expect(
      updateAuthenticatedUserMovie(
        client,
        "verified-user-id",
        "owned-row-id",
        input,
      ),
    ).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("watchflow_update_library_movie_v2", {
      p_library_id: "owned-row-id",
      p_status: "want_to_watch",
      p_personal_rating: 8.5,
      p_review: null,
      p_priority: 0,
      p_would_watch_again: false,
      p_watched_at: null,
      p_watched_at_provided: false,
      p_scheduled_for: null,
      p_timezone: null,
      p_schedule_note: null,
    });
  });

  it("passes an explicitly provided watched date through the v2 RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = { rpc } as unknown as SupabaseClient;

    await expect(
      updateAuthenticatedUserMovie(client, "verified-user-id", "owned-row-id", {
        ...input,
        status: "watched",
        watchedAt: "2026-09-08T00:00:00.000Z",
        watchedAtProvided: true,
      }),
    ).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith(
      "watchflow_update_library_movie_v2",
      expect.objectContaining({
        p_status: "watched",
        p_watched_at: "2026-09-08T00:00:00.000Z",
        p_watched_at_provided: true,
      }),
    );
  });

  it("reports an explicit RLS authorization failure", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "row-level security policy violation" },
      }),
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
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "23514", message: "check constraint violation" },
      }),
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

  it("keeps queue normalization inside the one management RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = { rpc } as unknown as SupabaseClient;

    await expect(
      updateAuthenticatedUserMovie(
        client,
        "verified-user-id",
        "owned-row-id",
        { ...input, status: "watch_next" },
      ),
    ).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "watchflow_update_library_movie_v2",
      expect.objectContaining({ p_status: "watch_next" }),
    );
  });

  it("reports a missing atomic management RPC explicitly", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST202", message: "function not found" },
      }),
    } as unknown as SupabaseClient;

    await expect(
      updateAuthenticatedUserMovie(
        client,
        "verified-user-id",
        "owned-row-id",
        input,
      ),
    ).rejects.toBeInstanceOf(LibrarySchemaError);
  });

  it("schedules an owned row through one atomic scheduling RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = { rpc } as unknown as SupabaseClient;

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
    ).resolves.toEqual({ movieId: "" });

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("watchflow_schedule_movie", {
      p_library_id: "owned-row-id",
      p_scheduled_for: "2099-07-22T14:30:00.000Z",
      p_timezone: "Asia/Karachi",
      p_schedule_note: null,
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("user_id");
  });

  it("trusts the RPC's owner check when another user's movie is requested", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const client = { rpc } as unknown as SupabaseClient;

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
    expect(rpc).toHaveBeenCalledOnce();
    expect(client).not.toHaveProperty("from");
  });

  it("sets an owned Watch Next priority through its narrow RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { success: true, priority: 5 },
      error: null,
    });
    const dependencies = createSupabaseManagementDependencies();

    await expect(
      dependencies.setWatchNextPriority(
        {
          userId: "verified-user-id",
          client: { rpc } as unknown as SupabaseClient,
        },
        "owned-row-id",
        5,
      ),
    ).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith("watchflow_set_watch_next_priority", {
      p_user_movie_id: "owned-row-id",
      p_priority: 5,
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("user_id");
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it("preserves hidden metadata through an authenticated owner-scoped lookup", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          personal_rating: 9.2,
          priority: 4,
          would_watch_again: true,
        },
        error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const from = vi.fn().mockReturnValue(query);
    const client = { from, rpc } as unknown as SupabaseClient;

    await expect(
      updateAuthenticatedUserMovie(client, "verified-user-id", "owned-row-id", {
        ...input,
        preservePersonalRating: true,
        preservePriority: true,
        preserveWouldWatchAgain: true,
      }),
    ).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith("user_movies");
    expect(query.select).toHaveBeenCalledWith(
      "personal_rating,priority,would_watch_again",
    );
    expect(query.eq).toHaveBeenNthCalledWith(1, "id", "owned-row-id");
    expect(query.eq).toHaveBeenNthCalledWith(2, "user_id", "verified-user-id");
    expect(rpc).toHaveBeenCalledWith(
      "watchflow_update_library_movie_v2",
      expect.objectContaining({
        p_personal_rating: 9.2,
        p_priority: 4,
        p_would_watch_again: true,
      }),
    );
  });

  it("does not mutate a row when the preservation lookup is not owned", async () => {
    const rpc = vi.fn();
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const client = {
      from: vi.fn().mockReturnValue(query),
      rpc,
    } as unknown as SupabaseClient;

    await expect(
      updateAuthenticatedUserMovie(
        client,
        "verified-user-id",
        "another-users-row-id",
        { ...input, preservePriority: true },
      ),
    ).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not report a profile permission denial as a missing scheduling RPC", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "42501",
          message: "permission denied for column updated_at of relation profiles",
        },
      }),
    } as unknown as SupabaseClient;

    const error = await scheduleAuthenticatedUserMovie(
      client,
      "verified-user-id",
      "owned-row-id",
      {
        scheduledFor: "2099-07-22T14:30:00.000Z",
        timezone: "Asia/Karachi",
        scheduleNote: null,
      },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LibraryAuthorizationError);
    expect(error).not.toBeInstanceOf(LibrarySchemaError);
  });

  it("reports a missing scheduling RPC explicitly", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find watchflow_schedule_movie",
        },
      }),
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
    expect(createNotificationMock).not.toHaveBeenCalled();
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
