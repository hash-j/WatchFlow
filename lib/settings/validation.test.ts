import { describe, expect, it } from "vitest";

import { mapUserPreferences } from "./mapping";
import { DEFAULT_USER_PREFERENCES } from "./types";
import {
  applicationPreferencesSchema,
  deleteAccountSchema,
  deleteLibrarySchema,
  notificationPreferencesSchema,
  profileSettingsSchema,
} from "./validation";

const validPreferences = {
  defaultMovieStatus: "watch_next",
  defaultPriority: "4",
  defaultLibraryView: "list",
  dateFormat: "YYYY-MM-DD",
  timeFormat: "24h",
  showAdultResults: "on",
  includeUnreleasedMovies: "on",
  preferredLanguage: "ur",
  moviesPerPage: "48",
};

describe("profile settings validation", () => {
  it("trims and accepts full name, country, and a valid IANA timezone", () => {
    expect(
      profileSettingsSchema.parse({
        fullName: "  Aisha Khan  ",
        country: "  Pakistan  ",
        timezone: "Asia/Karachi",
      }),
    ).toEqual({
      fullName: "Aisha Khan",
      country: "Pakistan",
      timezone: "Asia/Karachi",
    });
  });

  it("rejects an invalid timezone", () => {
    expect(
      profileSettingsSchema.safeParse({
        fullName: "Aisha Khan",
        country: "Pakistan",
        timezone: "Karachi Standard Time",
      }).success,
    ).toBe(false);
  });
});

describe("application preference validation", () => {
  it("maps missing database data to documented defaults", () => {
    expect(mapUserPreferences(null)).toEqual(DEFAULT_USER_PREFERENCES);
    expect(mapUserPreferences(null).showAdultResults).toBe(false);
  });

  it("accepts a complete valid preference update", () => {
    expect(applicationPreferencesSchema.parse(validPreferences)).toMatchObject({
      defaultMovieStatus: "watch_next",
      defaultPriority: 4,
      defaultLibraryView: "list",
      moviesPerPage: 48,
    });
  });

  it.each([
    ["status", { ...validPreferences, defaultMovieStatus: "private" }],
    [
      "schedule-less scheduled default",
      { ...validPreferences, defaultMovieStatus: "scheduled" },
    ],
    ["priority", { ...validPreferences, defaultPriority: "6" }],
    ["page size", { ...validPreferences, moviesPerPage: "25" }],
  ])("rejects an invalid %s", (_label, input) => {
    expect(applicationPreferencesSchema.safeParse(input).success).toBe(false);
  });

  it("repairs a legacy scheduled default to want to watch when reading data", () => {
    expect(
      mapUserPreferences({ default_movie_status: "scheduled" })
        .defaultMovieStatus,
    ).toBe("want_to_watch");
  });
});

describe("notification and destructive confirmation validation", () => {
  it("accepts saved notification preferences", () => {
    expect(
      notificationPreferencesSchema.parse({
        emailNotificationsEnabled: "on",
        scheduleRemindersEnabled: null,
        reminderOffsetMinutes: "180",
        weeklySummaryEnabled: "on",
      }),
    ).toEqual({
      emailNotificationsEnabled: true,
      scheduleRemindersEnabled: false,
      reminderOffsetMinutes: 180,
      weeklySummaryEnabled: true,
    });
  });

  it("rejects an unsupported reminder offset", () => {
    expect(
      notificationPreferencesSchema.safeParse({
        reminderOffsetMinutes: "120",
      }).success,
    ).toBe(false);
  });

  it("requires exact, separate deletion confirmations", () => {
    expect(deleteLibrarySchema.safeParse({ confirmation: "DELETE" }).success).toBe(
      false,
    );
    expect(
      deleteLibrarySchema.safeParse({ confirmation: "DELETE MOVIES" }).success,
    ).toBe(true);
    expect(
      deleteAccountSchema.safeParse({ confirmation: "DELETE", confirmed: null })
        .success,
    ).toBe(false);
    expect(
      deleteAccountSchema.safeParse({ confirmation: "DELETE", confirmed: "on" })
        .success,
    ).toBe(true);
  });
});
