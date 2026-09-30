import { describe, expect, it } from "vitest";

import {
  isGoogleCalendarEventDeleted,
  sameGoogleCalendarEventSecond,
} from "./google-calendar-provider-contract";

describe("Google Calendar provider timestamp contract", () => {
  it("accepts omitted fractional seconds only within the same provider second", () => {
    expect(
      sameGoogleCalendarEventSecond(
        "2026-10-08T18:03:36.742Z",
        "2026-10-08T18:03:36Z",
      ),
    ).toBe(true);
    expect(
      sameGoogleCalendarEventSecond(
        "2026-10-08T18:03:36.742Z",
        "2026-10-08T18:03:37Z",
      ),
    ).toBe(false);
    expect(sameGoogleCalendarEventSecond("invalid", "2026-10-08T18:03:36Z")).toBe(
      false,
    );
  });

  it("recognizes only absence responses or an exact cancelled-event tombstone", () => {
    expect(isGoogleCalendarEventDeleted(404, null)).toBe(true);
    expect(isGoogleCalendarEventDeleted(410, null)).toBe(true);
    expect(isGoogleCalendarEventDeleted(200, "cancelled")).toBe(true);
    expect(isGoogleCalendarEventDeleted(200, "confirmed")).toBe(false);
    expect(isGoogleCalendarEventDeleted(403, null)).toBe(false);
  });
});
