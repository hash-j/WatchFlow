import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  logSupabaseError: vi.fn(),
  dispatchNotificationEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/auth", () => ({
  getAuthContext: mocks.getAuthContext,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/supabase/error-logging", () => ({
  logSupabaseError: mocks.logSupabaseError,
}));
vi.mock("./dispatcher", () => ({
  dispatchNotificationEvent: mocks.dispatchNotificationEvent,
}));

import {
  countUnreadNotifications,
  createCustomListMovieAddedNotification,
  createCsvImportCompletedNotification,
  createMovieStatusTransitionNotification,
  getMovieStatusNotificationEvent,
  markAllOwnedNotificationsRead,
  markOwnedNotificationRead,
  readOwnedMovieStatusTransitionSnapshots,
  readOwnedNotifications,
} from "./supabase-notifications";
import { NotificationsAuthenticationError } from "./errors";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const notificationId = "11111111-1111-4111-8111-111111111111";
const row = {
  id: notificationId,
  type: "system",
  title: "System update",
  body: "WatchFlow has an update.",
  action_path: "/settings",
  metadata: {},
  read_at: null,
  created_at: "2026-09-25T09:00:00.000Z",
};

function feedClient(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn().mockResolvedValue(result);

  return {
    client: { from: vi.fn(() => chain) },
    chain,
  };
}

function categoryPreferenceClient(ownerId = userId, enabled = true) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        notification_movie_status_enabled: enabled,
        notification_watch_next_enabled: enabled,
        notification_custom_lists_enabled: enabled,
        notification_imports_enabled: enabled,
      },
      error: null,
    }),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: ownerId } },
        error: null,
      }),
    },
    from: vi.fn(() => chain),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dispatchNotificationEvent.mockResolvedValue({ status: "delivered" });
  mocks.createClient.mockResolvedValue(categoryPreferenceClient());
});

describe("authenticated notification service", () => {
  it("reads a bounded owner-scoped newest-first feed", async () => {
    const { client, chain } = feedClient({ data: [row], error: null });

    const result = await readOwnedNotifications(client as never, userId);

    expect(client.from).toHaveBeenCalledWith("notifications");
    expect(chain.eq).toHaveBeenCalledWith("user_id", userId);
    expect(chain.order).toHaveBeenNthCalledWith(1, "created_at", {
      ascending: false,
    });
    expect(chain.order).toHaveBeenNthCalledWith(2, "id", {
      ascending: false,
    });
    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(result[0]?.id).toBe(notificationId);
  });

  it("uses a safe zero badge when the optional shell count fails", async () => {
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn().mockResolvedValue({
        count: null,
        error: { code: "42P01" },
      }),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    const client = { from: vi.fn(() => chain) };

    await expect(
      countUnreadNotifications(client as never, userId),
    ).resolves.toBe(0);
    expect(chain.eq).toHaveBeenCalledWith("user_id", userId);
    expect(chain.is).toHaveBeenCalledWith("read_at", null);
    expect(mocks.logSupabaseError).toHaveBeenCalledOnce();
  });

  it("freshly authenticates mutations and sends no browser owner ID", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: 3, error: null });
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: userId } },
          error: null,
        }),
      },
      rpc,
    });

    await expect(markOwnedNotificationRead(notificationId)).resolves.toBe(true);
    await expect(markAllOwnedNotificationsRead()).resolves.toBe(3);
    expect(rpc).toHaveBeenNthCalledWith(1, "watchflow_mark_notification_read", {
      p_notification_id: notificationId,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "watchflow_mark_all_notifications_read",
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(userId);
  });

  it("rejects a stale mutation session before calling an RPC", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
      rpc,
    });

    await expect(markOwnedNotificationRead(notificationId)).rejects.toThrow(
      NotificationsAuthenticationError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("trusted CSV import notification producer", () => {
  it("uses a fixed owner-scoped payload and deterministic idempotent identifier", async () => {
    mocks.createClient
      .mockResolvedValueOnce(categoryPreferenceClient())
      .mockResolvedValueOnce(categoryPreferenceClient())
      .mockResolvedValueOnce(
        categoryPreferenceClient("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
      );
    const writes: unknown[] = [];
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "created" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: "created-for-b" }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const upsert = vi.fn((payload, options) => {
      writes.push({ payload, options });
      return { select };
    });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({ upsert })),
    });

    const first = await createCsvImportCompletedNotification({
      verifiedUserId: userId,
      completionId: notificationId,
    });
    const duplicate = await createCsvImportCompletedNotification({
      verifiedUserId: userId,
      completionId: notificationId,
    });
    const otherUser = await createCsvImportCompletedNotification({
      verifiedUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      completionId: notificationId,
    });

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(first.id).toBe(duplicate.id);
    expect(otherUser.id).not.toBe(first.id);
    expect(mocks.createAdminClient).toHaveBeenNthCalledWith(1, userId);

    const firstWrite = writes[0] as {
      payload: Record<string, unknown>;
      options: Record<string, unknown>;
    };
    const duplicateWrite = writes[1] as typeof firstWrite;
    expect(firstWrite.payload).toMatchObject({
      id: first.id,
      user_id: userId,
      type: "system",
      title: "CSV import complete",
      action_path: "/library",
      metadata: {
        source: "csv_import_v2",
        completion_id: notificationId,
      },
    });
    expect(firstWrite.options).toEqual({
      onConflict: "id",
      ignoreDuplicates: true,
    });
    expect(duplicateWrite.payload.id).toBe(firstWrite.payload.id);
    expect(mocks.dispatchNotificationEvent).toHaveBeenCalledTimes(2);
    expect(mocks.dispatchNotificationEvent).toHaveBeenNthCalledWith(1, {
      notificationId: first.id,
      category: "imports",
      title: "CSV import complete",
      body: "Your CSV import completed successfully. Review your Library for imported movies.",
      movieTitle: null,
      imageUrl: null,
      actionUrl: `/library?notification=${first.id}&notificationSource=push`,
    });
  });

  it("keeps the durable notification successful when push delivery fails", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "created" },
      error: null,
    });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({ maybeSingle })),
        })),
      })),
    });
    mocks.dispatchNotificationEvent.mockRejectedValueOnce(
      new Error("push provider unavailable"),
    );

    await expect(
      createCsvImportCompletedNotification({
        verifiedUserId: userId,
        completionId: notificationId,
      }),
    ).resolves.toMatchObject({ created: true });
  });
});

describe("trusted movie status transition notification producer", () => {
  const snapshot = {
    userMovieId: "22222222-2222-4222-8222-222222222222",
    status: "scheduled" as const,
    updatedAt: "2026-09-24T10:00:00.000Z",
    movieTitle: "Arrival",
  };

  it("recognizes only the three supported status events", () => {
    expect(getMovieStatusNotificationEvent("scheduled", "currently_watching"))
      .toBe("scheduled_to_watching");
    expect(getMovieStatusNotificationEvent("currently_watching", "watched"))
      .toBe("watching_to_watched");
    expect(getMovieStatusNotificationEvent("want_to_watch", "watch_next"))
      .toBe("added_to_watch_next");
    expect(getMovieStatusNotificationEvent("watch_next", "watch_next"))
      .toBeNull();
    expect(getMovieStatusNotificationEvent("scheduled", "watched")).toBeNull();
  });

  it("reads only owner-scoped transition snapshots", async () => {
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn().mockResolvedValue({
        data: [{
          id: snapshot.userMovieId,
          status: snapshot.status,
          updated_at: snapshot.updatedAt,
          movies: { title: snapshot.movieTitle },
        }],
        error: null,
      }),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    const client = { from: vi.fn(() => chain) };

    await expect(
      readOwnedMovieStatusTransitionSnapshots(
        client as never,
        userId,
        [snapshot.userMovieId],
      ),
    ).resolves.toEqual([{ ...snapshot, moviePosterPath: null }]);
    expect(chain.eq).toHaveBeenCalledWith("user_id", userId);
    expect(chain.in).toHaveBeenCalledWith("id", [snapshot.userMovieId]);
  });

  it("creates an owner-bound idempotent notification for a valid transition", async () => {
    mocks.createClient
      .mockResolvedValueOnce(categoryPreferenceClient())
      .mockResolvedValueOnce(categoryPreferenceClient())
      .mockResolvedValueOnce(
        categoryPreferenceClient("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
      );
    const writes: Array<Record<string, unknown>> = [];
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "created" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: "other-owner" }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const upsert = vi.fn((payload) => {
      writes.push(payload);
      return { select };
    });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({ upsert })),
    });

    const first = await createMovieStatusTransitionNotification({
      verifiedUserId: userId,
      snapshot,
      nextStatus: "currently_watching",
    });
    const duplicate = await createMovieStatusTransitionNotification({
      verifiedUserId: userId,
      snapshot,
      nextStatus: "currently_watching",
    });
    const otherOwner = await createMovieStatusTransitionNotification({
      verifiedUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      snapshot,
      nextStatus: "currently_watching",
    });

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(first.id).toBe(duplicate.id);
    expect(otherOwner.id).not.toBe(first.id);
    expect(writes[0]).toMatchObject({
      user_id: userId,
      type: "system",
      title: "Movie started",
      body: "You started watching Arrival.",
      metadata: {
        source: "movie_status_transition",
        category: "movie_status",
        event: "scheduled_to_watching",
        user_movie_id: snapshot.userMovieId,
      },
    });
    expect(mocks.dispatchNotificationEvent).toHaveBeenCalledTimes(2);
    expect(mocks.dispatchNotificationEvent).toHaveBeenNthCalledWith(1, {
      notificationId: first.id,
      category: "movie_status",
      title: "Movie started",
      body: "You started watching Arrival.",
      movieTitle: "Arrival",
      imageUrl: null,
      actionUrl: `/library?notification=${first.id}&notificationSource=push`,
    });
  });

  it("creates no notification for an unsupported transition", async () => {
    const result = await createMovieStatusTransitionNotification({
      verifiedUserId: userId,
      snapshot,
      nextStatus: "watched",
    });

    expect(result).toEqual({ id: null, created: false });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.dispatchNotificationEvent).not.toHaveBeenCalled();
  });

  it("creates no notification when the owner disabled that category", async () => {
    mocks.createClient.mockResolvedValueOnce(
      categoryPreferenceClient(userId, false),
    );

    await expect(
      createMovieStatusTransitionNotification({
        verifiedUserId: userId,
        snapshot,
        nextStatus: "currently_watching",
      }),
    ).resolves.toEqual({ id: null, created: false });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.dispatchNotificationEvent).not.toHaveBeenCalled();
  });
});

describe("trusted custom-list notification producer", () => {
  const input = {
    verifiedUserId: userId,
    listId: "22222222-2222-4222-8222-222222222222",
    listMovieId: "33333333-3333-4333-8333-333333333333",
    userMovieId: "44444444-4444-4444-8444-444444444444",
    listName: "Weekend Movies",
    movieTitle: "Arrival",
  };

  it("creates fixed owner-bound content and suppresses duplicate delivery", async () => {
    mocks.createClient
      .mockResolvedValueOnce(categoryPreferenceClient())
      .mockResolvedValueOnce(categoryPreferenceClient())
      .mockResolvedValueOnce(
        categoryPreferenceClient("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
      );
    const writes: Array<Record<string, unknown>> = [];
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "created" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: "other-owner" }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const upsert = vi.fn((payload) => {
      writes.push(payload);
      return { select };
    });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({ upsert })),
    });

    const first = await createCustomListMovieAddedNotification(input);
    const duplicate = await createCustomListMovieAddedNotification(input);
    const otherOwner = await createCustomListMovieAddedNotification({
      ...input,
      verifiedUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(first.id).toBe(duplicate.id);
    expect(otherOwner.id).not.toBe(first.id);
    expect(writes[0]).toMatchObject({
      user_id: userId,
      type: "system",
      title: "Added to custom list",
      body: "Arrival was added to Weekend Movies.",
      action_path: `/lists/${input.listId}`,
      metadata: {
        source: "custom_list_membership",
        category: "custom_lists",
        event: "movie_added",
        list_id: input.listId,
        list_movie_id: input.listMovieId,
        user_movie_id: input.userMovieId,
      },
    });
    expect(mocks.dispatchNotificationEvent).toHaveBeenCalledTimes(2);
    expect(mocks.dispatchNotificationEvent).toHaveBeenNthCalledWith(1, {
      notificationId: first.id,
      category: "custom_lists",
      title: "Added to custom list",
      body: "Arrival was added to Weekend Movies.",
      movieTitle: "Arrival",
      imageUrl: null,
      actionUrl: `/lists/${input.listId}?notification=${first.id}&notificationSource=push`,
    });
  });
});
