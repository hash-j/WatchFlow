import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateSettings: vi.fn(),
  savePushSubscription: vi.fn(),
  disablePushNotifications: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/settings/supabase-settings", () => ({
  authenticateSettings: mocks.authenticateSettings,
}));
vi.mock("@/lib/push/supabase-push", () => ({
  savePushSubscription: mocks.savePushSubscription,
  disablePushNotifications: mocks.disablePushNotifications,
}));

import {
  disablePushNotificationsAction,
  savePushSubscriptionAction,
} from "../../app/(app)/actions/push";

const subscription = {
  endpoint: "https://push.example.test/subscriptions/device-b",
  expirationTime: null,
  keys: {
    p256dh: "A".repeat(64),
    auth: "B".repeat(24),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateSettings.mockResolvedValue({
    user: { id: "verified-user" },
    client: { rpc: vi.fn() },
  });
  mocks.headers.mockResolvedValue(
    new Headers({ "user-agent": "Part 18E Test Browser" }),
  );
  mocks.savePushSubscription.mockResolvedValue("subscription-id");
  mocks.disablePushNotifications.mockResolvedValue(1);
});

describe("push subscription Server Actions", () => {
  it("saves a validated subscription after fresh authentication", async () => {
    const result = await savePushSubscriptionAction(subscription);

    expect(result.status).toBe("success");
    expect(mocks.authenticateSettings).toHaveBeenCalledOnce();
    expect(mocks.savePushSubscription).toHaveBeenCalledWith(
      expect.anything(),
      subscription,
      "Part 18E Test Browser",
    );
    expect(result.message).toBe(
      "Push notifications are enabled for this account.",
    );
  });

  it("rejects malformed or insecure subscription endpoints", async () => {
    const result = await savePushSubscriptionAction({
      ...subscription,
      endpoint: "http://push.example.test/device-b",
    });

    expect(result.status).toBe("error");
    expect(mocks.savePushSubscription).not.toHaveBeenCalled();
  });

  it("rejects subscription writes without a verified user", async () => {
    mocks.authenticateSettings.mockResolvedValue(null);

    const result = await savePushSubscriptionAction(subscription);
    expect(result.status).toBe("error");
    expect(result.message).toContain("session has expired");
    expect(mocks.savePushSubscription).not.toHaveBeenCalled();
  });

  it("disables only through the owner-deriving RPC", async () => {
    const result = await disablePushNotificationsAction();

    expect(result.status).toBe("success");
    expect(mocks.disablePushNotifications).toHaveBeenCalledWith(
      expect.anything(),
    );
    expect(result.message).toBe(
      "Push notifications are disabled for this account.",
    );
  });
});
