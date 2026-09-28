import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendWebPush: vi.fn(),
  createBackgroundClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/push/web-push-adapter", () => ({
  sendWebPush: mocks.sendWebPush,
}));
vi.mock("@/lib/supabase/background", () => ({
  createScheduledReminderBackgroundClient: mocks.createBackgroundClient,
}));

import { executeScheduledReminders } from "./scheduled-reminders";

const claim = (overrides: Record<string, unknown> = {}) => ({
  job_id: "11111111-1111-4111-8111-111111111111",
  delivery_id: "22222222-2222-4222-8222-222222222222",
  lease_token: "33333333-3333-4333-8333-333333333333",
  subscription_id: "44444444-4444-4444-8444-444444444444",
  endpoint: "https://push.example.test/device",
  p256dh: "A".repeat(64),
  auth_key: "B".repeat(24),
  notification_id: "55555555-5555-4555-8555-555555555555",
  title: "Scheduled movie reminder",
  body: "Arrival is coming up on your schedule.",
  action_path: "/schedule",
  movie_title: "Arrival",
  movie_poster_path: "/arrival.jpg",
  ...overrides,
});

function clientWithClaims(claims: unknown[]) {
  const rpc = vi.fn()
    .mockResolvedValueOnce({ data: claims, error: null })
    .mockResolvedValue({ data: "delivered", error: null });
  return { rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendWebPush.mockResolvedValue({ outcome: "delivered" });
});

describe("scheduled reminder executor", () => {
  it("claims through the narrow RPC, sends context, and finalizes the lease", async () => {
    const client = clientWithClaims([claim()]);

    await expect(executeScheduledReminders(7, client as never)).resolves.toEqual({
      claimedJobs: 1,
      attemptedDeliveries: 1,
      delivered: 1,
      retryable: 0,
      failed: 0,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(
      1,
      "watchflow_claim_scheduled_reminders",
      { p_batch_size: 7, p_lease_seconds: 120 },
    );
    expect(mocks.sendWebPush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example.test/device" }),
      expect.objectContaining({
        category: "schedule_reminders",
        movieTitle: "Arrival",
        imageUrl: "https://image.tmdb.org/t/p/w342/arrival.jpg",
        actionUrl: expect.stringContaining("/schedule?notification="),
      }),
    );
    expect(client.rpc).toHaveBeenNthCalledWith(
      2,
      "watchflow_finalize_scheduled_reminder",
      expect.objectContaining({
        p_job_id: claim().job_id,
        p_lease_token: claim().lease_token,
        p_results: [{
          deliveryId: claim().delivery_id,
          outcome: "delivered",
          statusCode: null,
        }],
      }),
    );
  });

  it.each([
    [{ outcome: "not_configured" }, "not_configured", 1, 0],
    [{ outcome: "failed", statusCode: 503, permanent: false }, "retryable_failure", 1, 0],
    [{ outcome: "failed", statusCode: 410, permanent: true }, "permanent_failure", 0, 1],
    [{ outcome: "failed", statusCode: null, permanent: false }, "terminal_failure", 0, 1],
  ])("maps bounded push outcomes for retry-safe finalization", async (
    pushResult,
    expectedOutcome,
    expectedRetryable,
    expectedFailed,
  ) => {
    const client = clientWithClaims([claim()]);
    mocks.sendWebPush.mockResolvedValue(pushResult);

    const result = await executeScheduledReminders(1, client as never);
    expect(result.retryable).toBe(expectedRetryable);
    expect(result.failed).toBe(expectedFailed);
    expect(client.rpc).toHaveBeenLastCalledWith(
      "watchflow_finalize_scheduled_reminder",
      expect.objectContaining({
        p_results: [expect.objectContaining({ outcome: expectedOutcome })],
      }),
    );
  });

  it("groups subscriptions under one job lease and finalizes once", async () => {
    const client = clientWithClaims([
      claim(),
      claim({
        delivery_id: "66666666-6666-4666-8666-666666666666",
        subscription_id: "77777777-7777-4777-8777-777777777777",
        endpoint: "https://push.example.test/other",
      }),
    ]);
    await executeScheduledReminders(10, client as never);
    expect(mocks.sendWebPush).toHaveBeenCalledTimes(2);
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });

  it("does not expose database errors or secrets", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "credential and row details" },
      }),
    };
    await expect(executeScheduledReminders(1, client as never)).rejects.toThrow(
      "Scheduled reminder claim failed.",
    );
  });
});
