import { describe, expect, it } from "vitest";

import { formatUserDate, formatUserTime } from "./formatting";

describe("user date and time formatting", () => {
  const instant = "2026-07-22T18:05:00.000Z";

  it("respects each supported date format", () => {
    expect(formatUserDate(instant, "UTC", "DD/MM/YYYY")).toBe("22/07/2026");
    expect(formatUserDate(instant, "UTC", "MM/DD/YYYY")).toBe("07/22/2026");
    expect(formatUserDate(instant, "UTC", "YYYY-MM-DD")).toBe("2026-07-22");
  });

  it("respects 12-hour and 24-hour time formats", () => {
    expect(formatUserTime(instant, "UTC", "12h")).toMatch(/6:05 PM/i);
    expect(formatUserTime(instant, "UTC", "24h")).toMatch(/18:05/);
  });
});
