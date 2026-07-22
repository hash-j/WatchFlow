import type { LibraryMovieStatus } from "@/lib/movies/types";

export const LIBRARY_VIEWS = ["grid", "list"] as const;
export type LibraryView = (typeof LIBRARY_VIEWS)[number];

export const DATE_FORMATS = [
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "YYYY-MM-DD",
] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const TIME_FORMATS = ["12h", "24h"] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

export const SUPPORTED_LANGUAGES = ["en", "ur", "es", "fr", "de"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const MOVIES_PER_PAGE_OPTIONS = [12, 24, 48, 96] as const;
export const REMINDER_OFFSET_OPTIONS = [15, 30, 60, 180, 1440] as const;

export type UserPreferences = {
  defaultMovieStatus: LibraryMovieStatus;
  defaultPriority: number;
  defaultLibraryView: LibraryView;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  showAdultResults: boolean;
  includeUnreleasedMovies: boolean;
  preferredLanguage: SupportedLanguage;
  moviesPerPage: number;
  emailNotificationsEnabled: boolean;
  scheduleRemindersEnabled: boolean;
  reminderOffsetMinutes: number;
  weeklySummaryEnabled: boolean;
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  defaultMovieStatus: "want_to_watch",
  defaultPriority: 0,
  defaultLibraryView: "grid",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "12h",
  showAdultResults: false,
  includeUnreleasedMovies: true,
  preferredLanguage: "en",
  moviesPerPage: 24,
  emailNotificationsEnabled: false,
  scheduleRemindersEnabled: false,
  reminderOffsetMinutes: 60,
  weeklySummaryEnabled: false,
};

export type ProfileSettings = {
  fullName: string;
  avatarUrl: string | null;
  country: string;
  timezone: string;
  createdAt: string | null;
};

export type SettingsActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors: Record<string, string[]>;
};

export const INITIAL_SETTINGS_ACTION_STATE: SettingsActionState = {
  status: "idle",
  message: null,
  fieldErrors: {},
};
