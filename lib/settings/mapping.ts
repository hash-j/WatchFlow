import { isValidTimeZone } from "@/lib/library/timezone";
import {
  DATE_FORMATS,
  DEFAULT_MOVIE_STATUSES,
  DEFAULT_USER_PREFERENCES,
  LIBRARY_VIEWS,
  MOVIES_PER_PAGE_OPTIONS,
  REMINDER_OFFSET_OPTIONS,
  SUPPORTED_LANGUAGES,
  TIME_FORMATS,
  type DateFormat,
  type LibraryView,
  type ProfileSettings,
  type SupportedLanguage,
  type TimeFormat,
  type UserPreferences,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown) {
  const result = stringValue(value);
  return result || null;
}

function enumValue<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
) {
  return typeof value === "string" && options.includes(value as T)
    ? (value as T)
    : fallback;
}

function numericOption(value: unknown, options: readonly number[], fallback: number) {
  return typeof value === "number" && options.includes(value) ? value : fallback;
}

export function mapProfileSettings(value: unknown): ProfileSettings {
  const record = isRecord(value) ? value : {};
  const timezone = stringValue(record.timezone);

  return {
    fullName: stringValue(record.full_name),
    avatarUrl: nullableString(record.avatar_url),
    country: stringValue(record.country),
    timezone: timezone && isValidTimeZone(timezone) ? timezone : "UTC",
    createdAt: nullableString(record.created_at),
  };
}

export function mapUserPreferences(value: unknown): UserPreferences {
  const record = isRecord(value) ? value : {};

  return {
    defaultMovieStatus: enumValue(
      record.default_movie_status,
      DEFAULT_MOVIE_STATUSES,
      DEFAULT_USER_PREFERENCES.defaultMovieStatus,
    ),
    defaultPriority:
      typeof record.default_priority === "number" &&
      Number.isInteger(record.default_priority) &&
      record.default_priority >= 0 &&
      record.default_priority <= 5
        ? record.default_priority
        : DEFAULT_USER_PREFERENCES.defaultPriority,
    defaultLibraryView: enumValue(
      record.default_library_view,
      LIBRARY_VIEWS,
      DEFAULT_USER_PREFERENCES.defaultLibraryView,
    ) as LibraryView,
    dateFormat: enumValue(
      record.date_format,
      DATE_FORMATS,
      DEFAULT_USER_PREFERENCES.dateFormat,
    ) as DateFormat,
    timeFormat: enumValue(
      record.time_format,
      TIME_FORMATS,
      DEFAULT_USER_PREFERENCES.timeFormat,
    ) as TimeFormat,
    showAdultResults: record.show_adult_results === true,
    includeUnreleasedMovies:
      record.include_unreleased_movies !== false,
    preferredLanguage: enumValue(
      record.preferred_language,
      SUPPORTED_LANGUAGES,
      DEFAULT_USER_PREFERENCES.preferredLanguage,
    ) as SupportedLanguage,
    moviesPerPage: numericOption(
      record.movies_per_page,
      MOVIES_PER_PAGE_OPTIONS,
      DEFAULT_USER_PREFERENCES.moviesPerPage,
    ),
    emailNotificationsEnabled: record.email_notifications_enabled === true,
    pushNotificationsEnabled: record.push_notifications_enabled === true,
    scheduleRemindersEnabled: record.schedule_reminders_enabled === true,
    reminderOffsetMinutes: numericOption(
      record.reminder_offset_minutes,
      REMINDER_OFFSET_OPTIONS,
      DEFAULT_USER_PREFERENCES.reminderOffsetMinutes,
    ),
    weeklySummaryEnabled: record.weekly_summary_enabled === true,
    notificationMovieStatusEnabled:
      record.notification_movie_status_enabled !== false,
    notificationWatchNextEnabled:
      record.notification_watch_next_enabled !== false,
    notificationCustomListsEnabled:
      record.notification_custom_lists_enabled !== false,
    notificationImportsEnabled:
      record.notification_imports_enabled !== false,
  };
}

export function toApplicationPreferencesRow(
  preferences: Pick<
    UserPreferences,
    | "defaultMovieStatus"
    | "defaultPriority"
    | "defaultLibraryView"
    | "dateFormat"
    | "timeFormat"
    | "showAdultResults"
    | "includeUnreleasedMovies"
    | "preferredLanguage"
    | "moviesPerPage"
  >,
) {
  return {
    default_movie_status: preferences.defaultMovieStatus,
    default_priority: preferences.defaultPriority,
    default_library_view: preferences.defaultLibraryView,
    date_format: preferences.dateFormat,
    time_format: preferences.timeFormat,
    show_adult_results: preferences.showAdultResults,
    include_unreleased_movies: preferences.includeUnreleasedMovies,
    preferred_language: preferences.preferredLanguage,
    movies_per_page: preferences.moviesPerPage,
  };
}

export function toNotificationPreferencesRow(
  preferences: Pick<
    UserPreferences,
    | "emailNotificationsEnabled"
    | "scheduleRemindersEnabled"
    | "reminderOffsetMinutes"
    | "weeklySummaryEnabled"
    | "notificationMovieStatusEnabled"
    | "notificationWatchNextEnabled"
    | "notificationCustomListsEnabled"
    | "notificationImportsEnabled"
  >,
) {
  return {
    email_notifications_enabled: preferences.emailNotificationsEnabled,
    schedule_reminders_enabled: preferences.scheduleRemindersEnabled,
    reminder_offset_minutes: preferences.reminderOffsetMinutes,
    weekly_summary_enabled: preferences.weeklySummaryEnabled,
    notification_movie_status_enabled:
      preferences.notificationMovieStatusEnabled,
    notification_watch_next_enabled: preferences.notificationWatchNextEnabled,
    notification_custom_lists_enabled:
      preferences.notificationCustomListsEnabled,
    notification_imports_enabled: preferences.notificationImportsEnabled,
  };
}
