import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVapidConfiguration: vi.fn(),
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./config", () => ({
  getVapidConfiguration: mocks.getVapidConfiguration,
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mocks.setVapidDetails,
    sendNotification: mocks.sendNotification,
  },
}));

import { sendWebPush } from "./web-push-adapter";

const subscription = {
  endpoint: "https://push.example.test/device",
  p256dh: "A".repeat(64),
  auth: "B".repeat(24),
};
const payload = {
  notificationId: "11111111-1111-4111-8111-111111111111",
  category: "watch_next" as const,
  title: "Added to Watch Next",
  body: "Arrival was added to your Watch Next queue.",
  movieTitle: "Arrival",
  imageUrl: "https://image.tmdb.org/t/p/w342/arrival.jpg",
  actionUrl: "/watch-next?notification=11111111-1111-4111-8111-111111111111&notificationSource=push",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getVapidConfiguration.mockReturnValue({
    subject: "mailto:notifications@example.com",
    publicKey: "public-key",
    privateKey: "private-key",
  });
  mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
});

describe("server-only Web Push adapter", () => {
  it("signs and sends the bounded notification payload", async () => {
    await expect(sendWebPush(subscription, payload)).resolves.toEqual({
      outcome: "delivered",
    });
    expect(mocks.setVapidDetails).toHaveBeenCalledWith(
      "mailto:notifications@example.com",
      "public-key",
      "private-key",
    );
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: 300, urgency: "normal", timeout: 5_000 },
    );
  });

  it("classifies only gone/not-found endpoints as permanently invalid", async () => {
    for (const statusCode of [404, 410]) {
      mocks.sendNotification.mockRejectedValueOnce({ statusCode });
      await expect(sendWebPush(subscription, payload)).resolves.toEqual({
        outcome: "failed",
        statusCode,
        permanent: true,
      });
    }

    mocks.sendNotification.mockRejectedValueOnce({ statusCode: 503 });
    await expect(sendWebPush(subscription, payload)).resolves.toEqual({
      outcome: "failed",
      statusCode: 503,
      permanent: false,
    });
  });

  it("treats a timed-out push request as a transient delivery failure", async () => {
    mocks.sendNotification.mockRejectedValueOnce({ code: "ETIMEDOUT" });

    await expect(sendWebPush(subscription, payload)).resolves.toEqual({
      outcome: "failed",
      statusCode: null,
      permanent: false,
    });
  });

  it("does not send when server-side VAPID signing is unavailable", async () => {
    mocks.getVapidConfiguration.mockReturnValue(null);
    await expect(sendWebPush(subscription, payload)).resolves.toEqual({
      outcome: "not_configured",
    });
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });
});
