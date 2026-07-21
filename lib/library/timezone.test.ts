import { describe, expect, it } from "vitest";

import { LibraryValidationError } from "./errors";
import {
  compareLocalDate,
  getLocalDateInput,
  getLocalTimeInput,
  zonedDateTimeToIso,
} from "./timezone";

describe("timezone scheduling", () => {
  it("converts a local wall time to a timezone-aware UTC instant", () => {
    expect(
      zonedDateTimeToIso("2026-07-21", "19:30", "Asia/Karachi"),
    ).toBe("2026-07-21T14:30:00.000Z");
  });

  it("accounts for daylight-saving offsets", () => {
    expect(
      zonedDateTimeToIso("2026-01-15", "12:00", "America/New_York"),
    ).toBe("2026-01-15T17:00:00.000Z");
    expect(
      zonedDateTimeToIso("2026-07-15", "12:00", "America/New_York"),
    ).toBe("2026-07-15T16:00:00.000Z");
  });

  it("rejects invalid timezones and nonexistent daylight-saving times", () => {
    expect(() =>
      zonedDateTimeToIso("2026-07-21", "19:30", "Not/A_Timezone"),
    ).toThrow(LibraryValidationError);
    expect(() =>
      zonedDateTimeToIso("2026-03-08", "02:30", "America/New_York"),
    ).toThrow("does not exist");
  });

  it("groups dates relative to today in the user's timezone", () => {
    const now = new Date("2026-07-21T20:00:00.000Z");

    expect(getLocalDateInput(now.toISOString(), "Asia/Karachi")).toBe(
      "2026-07-22",
    );
    expect(getLocalTimeInput(now.toISOString(), "Asia/Karachi")).toBe("01:00");
    expect(
      compareLocalDate("2026-07-22T12:00:00.000Z", "Asia/Karachi", now),
    ).toBe(0);
    expect(
      compareLocalDate("2026-07-23T12:00:00.000Z", "Asia/Karachi", now),
    ).toBeGreaterThan(0);
    expect(
      compareLocalDate("2026-07-20T12:00:00.000Z", "Asia/Karachi", now),
    ).toBeLessThan(0);
  });
});
