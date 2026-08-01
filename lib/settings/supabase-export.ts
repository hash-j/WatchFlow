import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSupabaseError } from "@/lib/supabase/error-logging";
import { SettingsPersistenceError } from "./errors";

const LIBRARY_EXPORT_SELECT = `
  status,
  favourite,
  personal_rating,
  review,
  priority,
  queue_position,
  scheduled_for,
  schedule_timezone,
  schedule_note,
  watched_at,
  would_watch_again,
  created_at,
  updated_at,
  movies (
    title,
    original_title,
    overview,
    release_date,
    release_year,
    runtime_minutes,
    genres,
    director,
    main_cast,
    original_language,
    production_countries,
    public_rating,
    tmdb_id
  )
`;

export async function readOwnedLibraryExportRows(
  client: SupabaseClient,
  userId: string,
) {
  const { data, error } = await client
    .from("user_movies")
    .select(LIBRARY_EXPORT_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    logSupabaseError("library export read failed", error);
    throw new SettingsPersistenceError("Your library export could not be created.");
  }

  return Array.isArray(data) ? data : [];
}

export async function readAccountExportSource(
  client: SupabaseClient,
  userId: string,
) {
  const [profileResult, preferencesResult, listsResult, library] =
    await Promise.all([
    client
      .from("profiles")
      .select("full_name, avatar_url, country, timezone, created_at")
      .eq("id", userId)
      .maybeSingle(),
    client
      .from("user_preferences")
      .select(
        "default_movie_status, default_priority, default_library_view, date_format, time_format, show_adult_results, include_unreleased_movies, preferred_language, movies_per_page, email_notifications_enabled, schedule_reminders_enabled, reminder_offset_minutes, weekly_summary_enabled, created_at, updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("lists")
      .select(
        "name, description, visibility, created_at, updated_at, list_movies(position, created_at, user_movies!inner(movies!inner(title, tmdb_id)))",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    readOwnedLibraryExportRows(client, userId),
  ]);

  if (profileResult.error) {
    logSupabaseError("account export profile read failed", profileResult.error);
    throw new SettingsPersistenceError("Your account export could not be created.");
  }

  if (preferencesResult.error) {
    logSupabaseError(
      "account export preferences read failed",
      preferencesResult.error,
    );
    throw new SettingsPersistenceError("Your account export could not be created.");
  }

  if (listsResult.error) {
    logSupabaseError("account export custom lists read failed", listsResult.error);
    throw new SettingsPersistenceError("Your account export could not be created.");
  }

  return {
    profile: profileResult.data,
    preferences: preferencesResult.data,
    library,
    lists: Array.isArray(listsResult.data) ? listsResult.data : [],
  };
}
