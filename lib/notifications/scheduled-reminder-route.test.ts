import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  target: vi.fn(),
  execute: vi.fn(),
  log: vi.fn((result) => result),
}));

vi.mock("@/lib/notifications/scheduler-auth", () => ({
  isAuthorizedSchedulerRequest: mocks.authorize,
}));
vi.mock("@/lib/notifications/scheduled-reminders", () => ({
  executeScheduledReminders: mocks.execute,
}));
vi.mock("@/lib/notifications/scheduler-target", () => ({
  isExpectedSchedulerTarget: mocks.target,
}));
vi.mock("@/lib/notifications/scheduler-observability", () => ({
  logScheduledReminderExecution: mocks.log,
}));

import {
  GET,
  POST,
} from "@/app/api/internal/notifications/scheduled-reminders/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockReturnValue(true);
  mocks.target.mockReturnValue(true);
  mocks.execute.mockResolvedValue({
    claimedJobs: 0,
    attemptedDeliveries: 0,
    delivered: 0,
    retryable: 0,
    failed: 0,
  });
});

describe("scheduled reminder executor route", () => {
  it.each([
    [null, "missing"],
    ["Basic malformed", "malformed"],
    ["Bearer wrong-secret", "incorrect"],
  ])("fails GET closed for %s authorization (%s)", async (authorization, classification) => {
    expect(classification).toMatch(/missing|malformed|incorrect/);
    mocks.authorize.mockReturnValue(false);
    const headers = authorization ? { authorization } : undefined;
    const response = await GET(new Request(
      "https://watchflow.test/api/internal/notifications/scheduled-reminders",
      { headers },
    ));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.authorize).toHaveBeenCalledWith(authorization);
    expect(mocks.target).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("fails closed on a target mismatch before background execution", async () => {
    mocks.target.mockReturnValue(false);
    const response = await GET(new Request(
      "https://watchflow.test/api/internal/notifications/scheduled-reminders",
      { headers: { authorization: "Bearer configured-secret" } },
    ));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([["GET", GET], ["POST", POST]] as const)(
    "%s delegates through the same authorized aggregate path",
    async (method, handler) => {
      const response = await handler(new Request(
        "https://watchflow.test/api/internal/notifications/scheduled-reminders",
        { method, headers: { authorization: "Bearer configured-secret" } },
      ));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("location")).toBeNull();
      expect(await response.json()).toEqual({
        claimedJobs: 0,
        attemptedDeliveries: 0,
        delivered: 0,
        retryable: 0,
        failed: 0,
      });
      expect(mocks.execute).toHaveBeenCalledTimes(1);
      expect(mocks.log).toHaveBeenCalledTimes(1);
    },
  );

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
