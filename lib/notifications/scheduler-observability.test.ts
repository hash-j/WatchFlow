import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  logCalendarSyncExecution,
  logScheduledReminderExecution,
} from "./scheduler-observability";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scheduler operational logging", () => {
  it("logs only scheduled-reminder aggregate counters", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const counters = logScheduledReminderExecution({
      claimedJobs: 2,
      attemptedDeliveries: 3,
      delivered: 1,
      retryable: 1,
      failed: 1,
      secret: "must-not-be-logged",
      email: "must-not-be-logged",
    } as never);
    expect(info).toHaveBeenCalledWith(
      "watchflow.scheduler.scheduled-reminders",
      counters,
    );
    expect(Object.keys(counters)).toEqual([
      "claimedJobs",
      "attemptedDeliveries",
      "delivered",
      "retryable",
      "failed",
    ]);
  });

  it("logs only calendar aggregate counters", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const counters = logCalendarSyncExecution({
      claimed: 4,
      succeeded: 1,
      retryable: 1,
      failed: 1,
      authRequired: 1,
      staleFinalizations: 0,
      refreshToken: "must-not-be-logged",
      movieTitle: "must-not-be-logged",
    } as never);
    expect(info).toHaveBeenCalledWith(
      "watchflow.scheduler.calendar-sync",
      counters,
    );
    expect(Object.keys(counters)).toEqual([
      "claimed",
      "succeeded",
      "retryable",
      "failed",
      "authRequired",
      "staleFinalizations",
    ]);
  });
});
