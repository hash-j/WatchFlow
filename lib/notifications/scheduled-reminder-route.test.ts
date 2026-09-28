import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/notifications/scheduler-auth", () => ({
  isAuthorizedSchedulerRequest: mocks.authorize,
}));
vi.mock("@/lib/notifications/scheduled-reminders", () => ({
  executeScheduledReminders: mocks.execute,
}));

import { POST } from "@/app/api/internal/notifications/scheduled-reminders/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockReturnValue(true);
  mocks.execute.mockResolvedValue({
    claimedJobs: 1,
    attemptedDeliveries: 1,
    delivered: 1,
    retryable: 0,
    failed: 0,
  });
});

describe("scheduled reminder executor route", () => {
  it("fails closed before constructing the privileged execution path", async () => {
    mocks.authorize.mockReturnValue(false);
    const response = await POST(new Request(
      "https://watchflow.test/api/internal/notifications/scheduled-reminders",
    ));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns only sanitized execution counts for an authorized call", async () => {
    const response = await POST(new Request(
      "https://watchflow.test/api/internal/notifications/scheduled-reminders",
      { method: "POST", headers: { authorization: "Bearer configured-secret" } },
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      claimedJobs: 1,
      attemptedDeliveries: 1,
      delivered: 1,
      retryable: 0,
      failed: 0,
    });
  });

  it("does not leak executor failure details", async () => {
    mocks.execute.mockRejectedValue(new Error("database credential and endpoint"));
    const response = await POST(new Request(
      "https://watchflow.test/api/internal/notifications/scheduled-reminders",
      { method: "POST", headers: { authorization: "Bearer configured-secret" } },
    ));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Scheduled reminder execution failed.",
    });
  });
});
