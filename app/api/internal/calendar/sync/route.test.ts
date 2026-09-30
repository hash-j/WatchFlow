import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/notifications/scheduler-auth", () => ({
  isAuthorizedSchedulerRequest: mocks.authorize,
}));
vi.mock("@/lib/calendar/calendar-sync-executor", () => ({
  executeCalendarSync: mocks.execute,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockReturnValue(true);
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
  it("fails closed before constructing background work", async () => {
    mocks.authorize.mockReturnValue(false);
    const response = await POST(new Request("http://localhost/api/internal/calendar/sync"));
    expect(response.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns only sanitized bounded execution totals", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal/calendar/sync", {
        method: "POST",
        headers: { authorization: "Bearer scheduler-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(expect.objectContaining({ claimed: 0 }));
    expect(mocks.authorize).toHaveBeenCalledWith("Bearer scheduler-secret");
  });

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
