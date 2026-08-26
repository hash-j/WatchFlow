import { describe, expect, it } from "vitest";

import { mapOnboardingProfile } from "./state";
import { parseOnboardingStep } from "./types";

describe("onboarding state", () => {
  it("maps a new profile with a null timestamp as incomplete", () => {
    expect(
      mapOnboardingProfile({
        onboarding_completed_at: null,
        timezone: "Asia/Karachi",
      }),
    ).toEqual({
      profileExists: true,
      completed: false,
      completedAt: null,
      timezone: "Asia/Karachi",
    });
  });

  it("maps completed and skipped timestamps as routing-complete", () => {
    for (const completedAt of [
      "2026-08-17T10:00:00.000Z",
      "2026-08-17T11:00:00.000Z",
    ]) {
      expect(
        mapOnboardingProfile({ onboarding_completed_at: completedAt, timezone: "UTC" }),
      ).toMatchObject({ completed: true, completedAt });
    }
  });

  it("treats a missing legacy profile as compatible instead of trapping it", () => {
    expect(mapOnboardingProfile(null)).toEqual({
      profileExists: false,
      completed: true,
      completedAt: null,
      timezone: "UTC",
    });
  });

  it("falls back from malformed profile values safely", () => {
    expect(
      mapOnboardingProfile({
        onboarding_completed_at: "not-a-date",
        timezone: "Invalid/Zone",
      }),
    ).toMatchObject({ completed: false, timezone: "UTC" });
  });
});

describe("onboarding step parsing", () => {
  it.each([
    [undefined, 1],
    ["1", 1],
    ["2", 2],
    [["3", "1"], 3],
    ["4", 1],
    ["not-a-step", 1],
  ])("maps %j to step %i", (value, expected) => {
    expect(parseOnboardingStep(value)).toBe(expected);
  });
});
