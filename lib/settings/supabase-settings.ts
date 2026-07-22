import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/error-logging";
import { SettingsPersistenceError } from "./errors";
import {
  mapProfileSettings,
  mapUserPreferences,
  toApplicationPreferencesRow,
  toNotificationPreferencesRow,
} from "./mapping";
import type { ProfileSettings, UserPreferences } from "./types";

export type AuthenticatedSettingsSession = {
  user: User;
  client: SupabaseClient;
};

export async function authenticateSettings(): Promise<AuthenticatedSettingsSession | null> {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    return null;
  }

  return { user, client };
}

export async function readProfileSettings(
  client: SupabaseClient,
  userId: string,
) {
  const { data, error } = await client
    .from("profiles")
    .select("full_name, avatar_url, country, timezone, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    logSupabaseError("profile settings read failed", error);
    throw new SettingsPersistenceError("Your profile could not be loaded.");
  }

  return mapProfileSettings(data);
}

export async function readUserPreferences(
  client: SupabaseClient,
  userId: string,
) {
  const { data, error } = await client
    .from("user_preferences")
    .select(
      "default_movie_status, default_priority, default_library_view, date_format, time_format, show_adult_results, include_unreleased_movies, preferred_language, movies_per_page, email_notifications_enabled, schedule_reminders_enabled, reminder_offset_minutes, weekly_summary_enabled",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logSupabaseError("user preferences read failed", error);
    throw new SettingsPersistenceError("Your preferences could not be loaded.");
  }

  return mapUserPreferences(data);
}

export async function getCurrentUserPreferences() {
  const session = await authenticateSettings();

  if (!session) {
    return null;
  }

  return readUserPreferences(session.client, session.user.id);
}

export async function getSettingsPageData() {
  const session = await authenticateSettings();

  if (!session) {
    return null;
  }

  const [profile, preferences, libraryCount] = await Promise.all([
    readProfileSettings(session.client, session.user.id),
    readUserPreferences(session.client, session.user.id),
    countUserLibrary(session.client, session.user.id),
  ]);

  return {
    user: session.user,
    profile,
    preferences,
    libraryCount,
  };
}

export async function updateOwnedProfile(
  client: SupabaseClient,
  userId: string,
  input: Pick<ProfileSettings, "fullName" | "country" | "timezone">,
) {
  const { data, error } = await client
    .from("profiles")
    .update({
      full_name: input.fullName,
      country: input.country || null,
      timezone: input.timezone,
    })
    .eq("id", userId)
    .select("full_name, avatar_url, country, timezone, created_at")
    .maybeSingle();

  if (error) {
    logSupabaseError("profile settings update failed", error);
    throw new SettingsPersistenceError();
  }

  return data ? mapProfileSettings(data) : null;
}

export async function updateApplicationPreferences(
  client: SupabaseClient,
  userId: string,
  input: Pick<
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
  const { error } = await client.from("user_preferences").upsert(
    {
      user_id: userId,
      ...toApplicationPreferencesRow(input),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    logSupabaseError("application preferences update failed", error);
    throw new SettingsPersistenceError();
  }
}

export async function updateNotificationPreferences(
  client: SupabaseClient,
  userId: string,
  input: Pick<
    UserPreferences,
    | "emailNotificationsEnabled"
    | "scheduleRemindersEnabled"
    | "reminderOffsetMinutes"
    | "weeklySummaryEnabled"
  >,
) {
  const { error } = await client.from("user_preferences").upsert(
    {
      user_id: userId,
      ...toNotificationPreferencesRow(input),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    logSupabaseError("notification preferences update failed", error);
    throw new SettingsPersistenceError();
  }
}

export async function countUserLibrary(
  client: SupabaseClient,
  userId: string,
) {
  const { count, error } = await client
    .from("user_movies")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    logSupabaseError("user library count failed", error);
    throw new SettingsPersistenceError("Your library count could not be loaded.");
  }

  return count ?? 0;
}
