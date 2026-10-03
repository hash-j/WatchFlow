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
vi.mock("@/lib/calendar/calendar-sync-executor", () => ({
  executeCalendarSync: mocks.execute,
}));
vi.mock("@/lib/notifications/scheduler-target", () => ({
  isExpectedSchedulerTarget: mocks.target,
}));
vi.mock("@/lib/notifications/scheduler-observability", () => ({
  logCalendarSyncExecution: mocks.log,
}));

import { GET, POST } from "@/app/api/internal/calendar/sync/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockReturnValue(true);
  mocks.target.mockReturnValue(true);
  mocks.execute.mockResolvedValue({
    claimed: 0,
    succeeded: 0,
    retryable: 0,
    failed: 0,
    authRequired: 0,
    staleFinalizations: 0,
  });
});

describe("Part 18J-C internal execution endpoint", () => {
  it.each([
    [null, "missing"],
    ["Basic malformed", "malformed"],
    ["Bearer wrong-secret", "incorrect"],
  ])("fails GET closed for %s authorization (%s)", async (authorization, classification) => {
    expect(classification).toMatch(/missing|malformed|incorrect/);
    mocks.authorize.mockReturnValue(false);
    const headers = authorization ? { authorization } : undefined;
    const response = await GET(new Request(
      "http://localhost/api/internal/calendar/sync",
      { headers },
    ));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.authorize).toHaveBeenCalledWith(authorization);
    expect(mocks.target).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("fails closed on a target mismatch before background execution", async () => {
    mocks.target.mockReturnValue(false);
    const response = await GET(new Request(
      "http://localhost/api/internal/calendar/sync",
      { headers: { authorization: "Bearer scheduler-secret" } },
    ));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([["GET", GET], ["POST", POST]] as const)(
    "%s returns only sanitized bounded execution totals",
    async (method, handler) => {
      const response = await handler(
        new Request("http://localhost/api/internal/calendar/sync", {
          method,
          headers: { authorization: "Bearer scheduler-secret" },
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("location")).toBeNull();
      expect(await response.json()).toEqual(expect.objectContaining({ claimed: 0 }));
      expect(mocks.authorize).toHaveBeenCalledWith("Bearer scheduler-secret");
      expect(mocks.execute).toHaveBeenCalledTimes(1);
      expect(mocks.log).toHaveBeenCalledTimes(1);
    },
  );

  it("does not expose executor or provider errors", async () => {
    mocks.execute.mockRejectedValue(new Error("access-token provider detail"));
    const response = await POST(
      new Request("http://localhost/api/internal/calendar/sync", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Calendar synchronization failed.",
    });
  });
});


