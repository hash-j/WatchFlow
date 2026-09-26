import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  sendWebPush: vi.fn(),
  logSupabaseError: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/push/web-push-adapter", () => ({
  sendWebPush: mocks.sendWebPush,
}));
vi.mock("@/lib/supabase/error-logging", () => ({
  logSupabaseError: mocks.logSupabaseError,
}));

import {
  createCustomListMovieAddedNotification,
  createMovieStatusTransitionNotification,
} from "./supabase-notifications";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function notificationWriter(createdResults: boolean[]) {
  const maybeSingle = vi.fn();
  for (const created of createdResults) {
    maybeSingle.mockResolvedValueOnce({
      data: created ? { id: "created" } : null,
      error: null,
    });
  }
  const select = vi.fn(() => ({ maybeSingle }));
  const upsert = vi.fn(() => ({ select }));
  const client = {
    from: vi.fn(() => ({ upsert })),
  };

  return { client, upsert };
}

function authenticatedDeliveryClient() {
  const preference = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { push_notifications_enabled: true },
      error: null,
    }),
  };
  preference.select.mockReturnValue(preference);
  preference.eq.mockReturnValue(preference);

  const subscriptions = {
    select: vi.fn(),
    eq: vi.fn().mockResolvedValue({
      data: [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        endpoint: "https://push.example.test/subscription",
        p256dh: "A".repeat(64),
        auth_key: "B".repeat(24),
        expiration_time: null,
      }],
      error: null,
    }),
  };
  subscriptions.select.mockReturnValue(subscriptions);

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "user_preferences") return preference;
      if (table === "push_subscriptions") return subscriptions;
      throw new Error(`Unexpected table ${table}`);
    }),
  } as unknown as SupabaseClient;

  return { client, preference, subscriptions };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendWebPush.mockResolvedValue({ outcome: "delivered" });
  mocks.createClient.mockResolvedValue(authenticatedDeliveryClient().client);
});

describe("notification producer delivery triggers", () => {
  it("dispatches a movie status notification only after its durable insert", async () => {
    const writer = notificationWriter([true, false]);
    mocks.createAdminClient.mockReturnValue(writer.client);
    const input = {
      verifiedUserId: userId,
      snapshot: {
        userMovieId: "11111111-1111-4111-8111-111111111111",
        status: "scheduled" as const,
        updatedAt: "2026-09-26T08:00:00.000Z",
        movieTitle: "Arrival",
      },
      nextStatus: "currently_watching" as const,
    };

    const created = await createMovieStatusTransitionNotification(input);
    const duplicate = await createMovieStatusTransitionNotification(input);

    expect(created.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(created.id).toBe(duplicate.id);
    expect(mocks.sendWebPush).toHaveBeenCalledOnce();
    expect(mocks.sendWebPush).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://push.example.test/subscription",
      }),
      {
        notificationId: created.id,
        category: "movie_status",
        title: "Movie started",
        body: "You started watching Arrival.",
        movieTitle: "Arrival",
        imageUrl: null,
        actionUrl: `/library?notification=${created.id}&notificationSource=push`,
      },
    );
  });

  it("dispatches a Watch Next addition through the authenticated owner pipeline", async () => {
    const writer = notificationWriter([true]);
    mocks.createAdminClient.mockReturnValue(writer.client);

    const result = await createMovieStatusTransitionNotification({
      verifiedUserId: userId,
      snapshot: {
        userMovieId: "22222222-2222-4222-8222-222222222222",
        status: "want_to_watch",
        updatedAt: "2026-09-26T08:15:00.000Z",
        movieTitle: "Inception",
        moviePosterPath: "/inception.jpg",
      },
      nextStatus: "watch_next",
    });

    expect(result.created).toBe(true);
    expect(mocks.createAdminClient).toHaveBeenCalledWith(userId);
    expect(mocks.sendWebPush).toHaveBeenCalledWith(
      expect.any(Object),
      {
        notificationId: result.id,
        category: "watch_next",
        title: "Added to Watch Next",
        body: "Inception was added to your Watch Next queue.",
        movieTitle: "Inception",
        imageUrl: "https://image.tmdb.org/t/p/w342/inception.jpg",
        actionUrl: `/watch-next?notification=${result.id}&notificationSource=push`,
      },
    );
  });

  it("dispatches a custom-list addition once and suppresses its duplicate", async () => {
    const writer = notificationWriter([true, false]);
    mocks.createAdminClient.mockReturnValue(writer.client);
    const input = {
      verifiedUserId: userId,
      listId: "33333333-3333-4333-8333-333333333333",
      listMovieId: "44444444-4444-4444-8444-444444444444",
      userMovieId: "55555555-5555-4555-8555-555555555555",
      listName: "Weekend Movies",
      movieTitle: "Blade Runner",
    };

    const created = await createCustomListMovieAddedNotification(input);
    const duplicate = await createCustomListMovieAddedNotification(input);

    expect(created.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(mocks.sendWebPush).toHaveBeenCalledOnce();
    expect(mocks.sendWebPush).toHaveBeenCalledWith(
      expect.any(Object),
      {
        notificationId: created.id,
        category: "custom_lists",
        title: "Added to custom list",
        body: "Blade Runner was added to Weekend Movies.",
        movieTitle: "Blade Runner",
        imageUrl: null,
        actionUrl: `/lists/${input.listId}?notification=${created.id}&notificationSource=push`,
      },
    );
  });

  it("keeps a successful notification creation successful when delivery fails", async () => {
    const writer = notificationWriter([true]);
    mocks.createAdminClient.mockReturnValue(writer.client);
    mocks.sendWebPush.mockRejectedValueOnce(new Error("push transport unavailable"));

    await expect(
      createCustomListMovieAddedNotification({
        verifiedUserId: userId,
        listId: "66666666-6666-4666-8666-666666666666",
        listMovieId: "77777777-7777-4777-8777-777777777777",
        userMovieId: "88888888-8888-4888-8888-888888888888",
        listName: "Favorites",
        movieTitle: "Moonlight",
      }),
    ).resolves.toMatchObject({ created: true });
    expect(writer.upsert).toHaveBeenCalledOnce();
    expect(mocks.sendWebPush).toHaveBeenCalledOnce();
  });
});
