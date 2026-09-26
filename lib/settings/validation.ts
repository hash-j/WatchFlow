import { z } from "zod";

import { isValidTimeZone } from "@/lib/library/timezone";
import {
  DATE_FORMATS,
  DEFAULT_MOVIE_STATUSES,
  LIBRARY_VIEWS,
  MOVIES_PER_PAGE_OPTIONS,
  REMINDER_OFFSET_OPTIONS,
  SUPPORTED_LANGUAGES,
  TIME_FORMATS,
} from "./types";

const checkboxSchema = z.preprocess(
  (value) => value === true || value === "true" || value === "on",
  z.boolean(),
);

const integerFromForm = (message: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() ? Number(value) : value,
    z.number({ error: message }).int(message),
  );

export const profileSettingsSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Enter your full name.")
    .max(100, "Full name must be 100 characters or fewer."),
  country: z
    .string()
    .trim()
    .max(80, "Country must be 80 characters or fewer."),
  timezone: z
    .string()
    .trim()
    .min(1, "Choose a timezone.")
    .max(100, "Timezone is too long.")
    .refine(isValidTimeZone, "Choose a valid IANA timezone."),
});

export const applicationPreferencesSchema = z.object({
  defaultMovieStatus: z.enum(DEFAULT_MOVIE_STATUSES, {
    error: "Choose a valid default status.",
  }),
  defaultPriority: integerFromForm(
    "Choose a priority from 0 to 5.",
  ).refine(
    (value) => value >= 0 && value <= 5,
    "Choose a priority from 0 to 5.",
  ),
  defaultLibraryView: z.enum(LIBRARY_VIEWS, {
    error: "Choose grid or list view.",
  }),
  dateFormat: z.enum(DATE_FORMATS, { error: "Choose a valid date format." }),
  timeFormat: z.enum(TIME_FORMATS, { error: "Choose a valid time format." }),
  showAdultResults: checkboxSchema,
  includeUnreleasedMovies: checkboxSchema,
  preferredLanguage: z.enum(SUPPORTED_LANGUAGES, {
    error: "Choose a supported language.",
  }),
  moviesPerPage: integerFromForm("Choose a valid page size.").refine(
    (value) => (MOVIES_PER_PAGE_OPTIONS as readonly number[]).includes(value),
    "Choose 12, 24, 48, or 96 movies per page.",
  ),
});

export const notificationPreferencesSchema = z.object({
  emailNotificationsEnabled: checkboxSchema,
  scheduleRemindersEnabled: checkboxSchema,
  reminderOffsetMinutes: integerFromForm(
    "Choose a valid reminder time.",
  ).refine(
    (value) => (REMINDER_OFFSET_OPTIONS as readonly number[]).includes(value),
    "Choose 15 minutes, 30 minutes, 1 hour, 3 hours, or 1 day.",
  ),
  weeklySummaryEnabled: checkboxSchema,
  notificationMovieStatusEnabled: checkboxSchema,
  notificationWatchNextEnabled: checkboxSchema,
  notificationCustomListsEnabled: checkboxSchema,
  notificationImportsEnabled: checkboxSchema,
});

export const deleteLibrarySchema = z.object({
  confirmation: z.literal("DELETE MOVIES", {
    error: "Type DELETE MOVIES exactly to confirm.",
  }),
});

export const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE", {
    error: "Type DELETE exactly to confirm.",
  }),
  confirmed: checkboxSchema.pipe(
    z.literal(true, {
      error: "Confirm that you understand this action is permanent.",
    }),
  ),
});

export function flattenZodErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}
