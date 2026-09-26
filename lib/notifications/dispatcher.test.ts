import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  sendWebPush: vi.fn(),
  logSupabaseError: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/push/web-push-adapter", () => ({
  sendWebPush: mocks.sendWebPush,
}));
vi.mock("@/lib/supabase/error-logging", () => ({
  logSupabaseError: mocks.logSupabaseError,
}));

import { dispatchNotificationEvent } from "./dispatcher";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const payload = {
  notificationId: "11111111-1111-4111-8111-111111111111",
  category: "imports" as const,
  title: "CSV import complete",
  body: "Your CSV import completed successfully.",
  movieTitle: null,
  imageUrl: null,
  actionUrl: "/library?notification=11111111-1111-4111-8111-111111111111&notificationSource=push",
};

function subscription(id: string, expirationTime: number | null = null) {
  return {
    id,
    endpoint: `https://push.example.test/${id}`,
    p256dh: "A".repeat(64),
    auth_key: "B".repeat(24),
    expiration_time: expirationTime,
  };
}

function dispatcherClient({
  enabled = true,
  rows = [],
}: {
  enabled?: boolean;
  rows?: ReturnType<typeof subscription>[];
}) {
  const removedIds: string[][] = [];
  const preference = {
    select: vi.fn(() => preference),
    eq: vi.fn(() => preference),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { push_notifications_enabled: enabled },
      error: null,
    }),
  };
  const subscriptions = {
    select: vi.fn(() => subscriptions),
    eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  const deletion = {
    delete: vi.fn(() => deletion),
    eq: vi.fn(() => deletion),
    in: vi.fn((_column: string, ids: string[]) => {
      removedIds.push(ids);
      return deletion;
    }),
    select: vi.fn().mockImplementation(async () => ({
      data: (removedIds.at(-1) ?? []).map((id) => ({ id })),
      error: null,
    })),
  };
  const from = vi.fn((table: string) => {
    if (table === "user_preferences") return preference;
    if (table === "push_subscriptions") {
      return from.mock.calls.filter(([name]) => name === table).length === 1
        ? subscriptions
        : deletion;
    }
    throw new Error(`Unexpected table ${table}`);
  });
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
    from,
  } as unknown as SupabaseClient;
  return { client, preference, subscriptions, deletion, removedIds };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendWebPush.mockResolvedValue({ outcome: "delivered" });
});

describe("authenticated notification dispatcher", () => {
  it("reads only the authenticated owner's subscriptions and delivers", async () => {
    const harness = dispatcherClient({
      rows: [subscription("sub-a"), subscription("sub-b")],
    });
    mocks.createClient.mockResolvedValue(harness.client);

    await expect(dispatchNotificationEvent(payload)).resolves.toEqual({
      status: "delivered",
      attempted: 2,
      delivered: 2,
      removed: 0,
      failed: 0,
    });
    expect(harness.preference.eq).toHaveBeenCalledWith("user_id", userId);
    expect(harness.subscriptions.eq).toHaveBeenCalledWith("user_id", userId);
    expect(mocks.sendWebPush).toHaveBeenCalledTimes(2);
  });

  it("skips delivery when the owner disabled push", async () => {
    const harness = dispatcherClient({ enabled: false });
    mocks.createClient.mockResolvedValue(harness.client);

    await expect(dispatchNotificationEvent(payload)).resolves.toEqual({
      status: "skipped",
      attempted: 0,
      delivered: 0,
      removed: 0,
      failed: 0,
    });
    expect(harness.subscriptions.select).not.toHaveBeenCalled();
    expect(mocks.sendWebPush).not.toHaveBeenCalled();
  });

  it("removes locally expired subscriptions without sending them", async () => {
    const harness = dispatcherClient({
      rows: [subscription("expired", Date.now() - 1_000)],
    });
    mocks.createClient.mockResolvedValue(harness.client);

    await expect(dispatchNotificationEvent(payload)).resolves.toMatchObject({
      status: "skipped",
      attempted: 0,
      delivered: 0,
      removed: 1,
    });
    expect(harness.deletion.eq).toHaveBeenCalledWith("user_id", userId);
    expect(harness.removedIds).toEqual([["expired"]]);
    expect(mocks.sendWebPush).not.toHaveBeenCalled();
  });

  it("removes 404/410 subscriptions but retains transient failures", async () => {
    const harness = dispatcherClient({
      rows: [subscription("gone"), subscription("temporary")],
    });
    mocks.createClient.mockResolvedValue(harness.client);
    mocks.sendWebPush
      .mockResolvedValueOnce({
        outcome: "failed",
        statusCode: 410,
        permanent: true,
      })
      .mockResolvedValueOnce({
        outcome: "failed",
        statusCode: 503,
        permanent: false,
      });

    await expect(dispatchNotificationEvent(payload)).resolves.toEqual({
      status: "partial",
      attempted: 2,
      delivered: 0,
      removed: 1,
      failed: 2,
    });
    expect(harness.removedIds).toEqual([["gone"]]);
    expect(harness.deletion.eq).toHaveBeenCalledWith("user_id", userId);
  });

  it("contains unexpected adapter failures and continues other deliveries", async () => {
    const harness = dispatcherClient({
      rows: [subscription("broken"), subscription("healthy")],
    });
    mocks.createClient.mockResolvedValue(harness.client);
    mocks.sendWebPush
      .mockRejectedValueOnce(new Error("provider transport failure"))
      .mockResolvedValueOnce({ outcome: "delivered" });

    await expect(dispatchNotificationEvent(payload)).resolves.toEqual({
      status: "partial",
      attempted: 2,
      delivered: 1,
      removed: 0,
      failed: 1,
    });
    expect(mocks.sendWebPush).toHaveBeenCalledTimes(2);
    expect(harness.deletion.delete).not.toHaveBeenCalled();
  });
});
