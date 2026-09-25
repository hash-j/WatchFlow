import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/error-logging", () => ({ logSupabaseError: vi.fn() }));

import {
  disablePushNotifications,
  savePushSubscription,
} from "./supabase-push";

const subscription = {
  endpoint: "https://push.example.test/subscriptions/device-b",
  expirationTime: null,
  keys: {
    p256dh: "A".repeat(64),
    auth: "B".repeat(24),
  },
};

describe("push subscription persistence", () => {
  it("uses only owner-deriving RPCs and never accepts a user ID", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: "subscription-id", error: null })
      .mockResolvedValueOnce({ data: 1, error: null });
    const client = { rpc } as unknown as SupabaseClient;

    await expect(
      savePushSubscription(client, subscription, "Test Browser"),
    ).resolves.toBe("subscription-id");
    await expect(disablePushNotifications(client)).resolves.toBe(1);

    expect(rpc).toHaveBeenNthCalledWith(1, "watchflow_save_push_subscription", {
      p_endpoint: subscription.endpoint,
      p_p256dh: subscription.keys.p256dh,
      p_auth_key: subscription.keys.auth,
      p_expiration_time: null,
      p_user_agent: "Test Browser",
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("user_id");
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "watchflow_disable_push_notifications",
    );
  });

  it("maps database and RLS failures to controlled errors", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS denied" },
      }),
    } as unknown as SupabaseClient;

    await expect(
      savePushSubscription(client, subscription, null),
    ).rejects.toThrow("could not be saved");
  });
});
