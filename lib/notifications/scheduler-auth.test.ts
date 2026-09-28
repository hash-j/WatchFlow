import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isAuthorizedSchedulerRequest } from "./scheduler-auth";

const originalSecret = process.env.WATCHFLOW_SCHEDULER_SECRET;
const secret = "a-strong-scheduler-secret-that-is-separate";

afterEach(() => {
  if (originalSecret === undefined) delete process.env.WATCHFLOW_SCHEDULER_SECRET;
  else process.env.WATCHFLOW_SCHEDULER_SECRET = originalSecret;
});

describe("scheduled reminder endpoint authentication", () => {
  it("fails closed when configuration or authorization is missing", () => {
    delete process.env.WATCHFLOW_SCHEDULER_SECRET;
    expect(isAuthorizedSchedulerRequest(`Bearer ${secret}`)).toBe(false);
    process.env.WATCHFLOW_SCHEDULER_SECRET = secret;
    expect(isAuthorizedSchedulerRequest(null)).toBe(false);
    expect(isAuthorizedSchedulerRequest("Basic anything")).toBe(false);
  });

  it("rejects weak, malformed, and incorrect credentials", () => {
    process.env.WATCHFLOW_SCHEDULER_SECRET = "too-short";
    expect(isAuthorizedSchedulerRequest("Bearer too-short")).toBe(false);
    process.env.WATCHFLOW_SCHEDULER_SECRET = secret;
    expect(isAuthorizedSchedulerRequest("Bearer wrong-secret-value-that-is-long-enough")).toBe(false);
    expect(isAuthorizedSchedulerRequest("Bearer ")).toBe(false);
  });

  it("accepts only the exact separately configured bearer secret", () => {
    process.env.WATCHFLOW_SCHEDULER_SECRET = secret;
    expect(isAuthorizedSchedulerRequest(`Bearer ${secret}`)).toBe(true);
  });
});
