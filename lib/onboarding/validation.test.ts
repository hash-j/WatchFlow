import { describe, expect, it } from "vitest";

import {
  onboardingPreferencesSchema,
  validateOnboardingMovieStatus,
} from "./validation";

describe("onboarding preference validation", () => {
  it("accepts the existing timezone, view, and language vocabulary", () => {
    expect(
      onboardingPreferencesSchema.parse({
        timezone: "Asia/Karachi",
        defaultLibraryView: "list",
        preferredLanguage: "ur",
      }),
    ).toEqual({
      timezone: "Asia/Karachi",
      defaultLibraryView: "list",
      preferredLanguage: "ur",
    });
  });

  it.each([
    [{ timezone: "Invalid/Zone", defaultLibraryView: "grid", preferredLanguage: "en" }, "timezone"],
    [{ timezone: "UTC", defaultLibraryView: "cards", preferredLanguage: "en" }, "defaultLibraryView"],
    [{ timezone: "UTC", defaultLibraryView: "grid", preferredLanguage: "xx" }, "preferredLanguage"],
  ])("rejects unsupported preference input", (input, field) => {
    const result = onboardingPreferencesSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toContain(field);
  });
});

describe("onboarding movie status validation", () => {
  it.each(["want_to_watch", "watched"])("accepts %s", (status) => {
    expect(validateOnboardingMovieStatus(status)).toMatchObject({ success: true });
  });

  it.each(["watch_next", "scheduled", "dropped", "", null])(
    "rejects advanced or invalid status %j",
    (status) => {
      expect(validateOnboardingMovieStatus(status).success).toBe(false);
    },
  );
});
