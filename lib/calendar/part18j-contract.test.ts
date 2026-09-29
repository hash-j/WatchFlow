import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CALENDAR_CONNECTION_STATUSES,
  CALENDAR_PROVIDERS,
  CALENDAR_SYNC_JOB_STATES,
  CALENDAR_SYNC_OPERATIONS,
  CALENDAR_SYNC_OUTCOMES,
} from "@/lib/calendar/types";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Part 18J-A provider-neutral contracts", () => {
  it("pins the MVP adapter to Google without leaking Google shapes into jobs", () => {
    expect(CALENDAR_PROVIDERS).toEqual(["google"]);
    expect(CALENDAR_CONNECTION_STATUSES).toEqual([
      "connected",
      "reconnect_required",
      "disconnect_pending",
    ]);
    expect(read("lib/calendar/types.ts")).not.toContain("gaxios");
    expect(read("lib/calendar/types.ts")).not.toContain("calendar_v3");
  });

  it("keeps operations, states, and finalization outcomes explicit", () => {
    expect(CALENDAR_SYNC_OPERATIONS).toEqual([
      "upsert",
      "delete",
      "connection_cleanup",
    ]);
    expect(CALENDAR_SYNC_JOB_STATES).toContain("auth_required");
    expect(CALENDAR_SYNC_JOB_STATES).toContain("retryable");
    expect(CALENDAR_SYNC_OUTCOMES).not.toContain("leased");
  });

  it("keeps deterministic identifier helpers server-only", () => {
    expect(read("lib/calendar/identifiers.ts")).toMatch(/^import "server-only";/);
    expect(read("lib/calendar/identifiers.ts")).not.toContain("process.env");
  });
});
