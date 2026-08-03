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
      "watchflow_update_library_movie",
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
    expect(rpc).toHaveBeenCalledWith("watchflow_update_library_movie", {
      p_library_id: "owned-row-id",
      p_status: "want_to_watch",
      p_personal_rating: 8.5,
      p_review: null,
      p_priority: 0,
      p_would_watch_again: false,
      p_watched_at: null,
      p_scheduled_for: null,
      p_timezone: null,
      p_schedule_note: null,
    });
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
      "watchflow_update_library_movie",
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
    const lookup = createBuilder({
      data: { id: "owned-row-id", movie_id: 42 },
      error: null,
    });
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = {
      from: vi.fn().mockReturnValue(lookup),
      rpc,
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
    ).resolves.toEqual({ movieId: "42" });

    expect(lookup.eq).toHaveBeenNthCalledWith(1, "id", "owned-row-id");
    expect(lookup.eq).toHaveBeenNthCalledWith(2, "user_id", "verified-user-id");
    expect(rpc).toHaveBeenCalledWith("watchflow_schedule_movie", {
      p_library_id: "owned-row-id",
      p_scheduled_for: "2099-07-22T14:30:00.000Z",
      p_timezone: "Asia/Karachi",
      p_schedule_note: null,
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("user_id");
  });

  it("does not schedule another user's movie", async () => {
    const lookup = createBuilder({ data: null, error: null });
    const rpc = vi.fn();
    const client = {
      from: vi.fn().mockReturnValue(lookup),
      rpc,
    } as unknown as SupabaseClient;

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
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not report a profile permission denial as a missing scheduling RPC", async () => {
    const lookup = createBuilder({
      data: { id: "owned-row-id", movie_id: 42 },
      error: null,
    });
    const client = {
      from: vi.fn().mockReturnValue(lookup),
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
    const lookup = createBuilder({
      data: { id: "owned-row-id", movie_id: 42 },
      error: null,
    });
    const client = {
      from: vi.fn().mockReturnValue(lookup),
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
