"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteOwnedLibraryData,
  deleteVerifiedAuthUser,
  hasRecentServerVerifiedLogin,
} from "@/lib/settings/data-controls";
import { SettingsPersistenceError } from "@/lib/settings/errors";
import {
  authenticateSettings,
  updateApplicationPreferences,
  updateNotificationPreferences,
  updateOwnedProfile,
} from "@/lib/settings/supabase-settings";
import type { SettingsActionState } from "@/lib/settings/types";
import {
  applicationPreferencesSchema,
  deleteAccountSchema,
  deleteLibrarySchema,
  flattenZodErrors,
  notificationPreferencesSchema,
  profileSettingsSchema,
} from "@/lib/settings/validation";
import { logSupabaseError } from "@/lib/supabase/error-logging";

function value(formData: FormData, key: string) {
  const result = formData.get(key);
  return typeof result === "string" ? result : "";
}

function authenticationError(): SettingsActionState {
  return {
    status: "error",
    message: "Your session has expired. Sign in again to manage settings.",
    fieldErrors: {},
  };
}

function validationError(fieldErrors: Record<string, string[]>): SettingsActionState {
  return {
    status: "error",
    message: "Review the highlighted fields and try again.",
    fieldErrors,
  };
}

function persistenceError(error: unknown): SettingsActionState {
  return {
    status: "error",
    message:
      error instanceof SettingsPersistenceError
        ? error.message
        : "WatchFlow could not save that change. Please try again.",
    fieldErrors: {},
  };
}

export async function updateProfileSettingsAction(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await authenticateSettings();
  if (!session) return authenticationError();

  const parsed = profileSettingsSchema.safeParse({
    fullName: value(formData, "fullName"),
    country: value(formData, "country"),
    timezone: value(formData, "timezone"),
  });

  if (!parsed.success) return validationError(flattenZodErrors(parsed.error));

  try {
    const profile = await updateOwnedProfile(
      session.client,
      session.user.id,
      parsed.data,
    );

    if (!profile) {
      return {
        status: "error",
        message: "Your profile record was not found. Please contact support.",
        fieldErrors: {},
      };
    }

    revalidatePath("/dashboard");
    revalidatePath("/schedule");
    revalidatePath("/settings/profile");
    return { status: "success", message: "Profile saved.", fieldErrors: {} };
  } catch (error) {
    return persistenceError(error);
  }
}

export async function updateApplicationPreferencesAction(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await authenticateSettings();
  if (!session) return authenticationError();

  const parsed = applicationPreferencesSchema.safeParse({
    defaultMovieStatus: value(formData, "defaultMovieStatus"),
    defaultPriority: value(formData, "defaultPriority"),
    defaultLibraryView: value(formData, "defaultLibraryView"),
    dateFormat: value(formData, "dateFormat"),
    timeFormat: value(formData, "timeFormat"),
    showAdultResults: formData.get("showAdultResults"),
    includeUnreleasedMovies: formData.get("includeUnreleasedMovies"),
    preferredLanguage: value(formData, "preferredLanguage"),
    moviesPerPage: value(formData, "moviesPerPage"),
  });

  if (!parsed.success) return validationError(flattenZodErrors(parsed.error));

  try {
    await updateApplicationPreferences(
      session.client,
      session.user.id,
      parsed.data,
    );
    for (const path of ["/dashboard", "/search", "/library", "/schedule"]) {
      revalidatePath(path);
    }
    revalidatePath("/settings/preferences");
    return {
      status: "success",
      message: "Application preferences saved.",
      fieldErrors: {},
    };
  } catch (error) {
    return persistenceError(error);
  }
}

export async function updateNotificationPreferencesAction(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await authenticateSettings();
  if (!session) return authenticationError();

  const parsed = notificationPreferencesSchema.safeParse({
    emailNotificationsEnabled: formData.get("emailNotificationsEnabled"),
    scheduleRemindersEnabled: formData.get("scheduleRemindersEnabled"),
    reminderOffsetMinutes: value(formData, "reminderOffsetMinutes"),
    weeklySummaryEnabled: formData.get("weeklySummaryEnabled"),
  });

  if (!parsed.success) return validationError(flattenZodErrors(parsed.error));

  try {
    await updateNotificationPreferences(
      session.client,
      session.user.id,
      parsed.data,
    );
    revalidatePath("/settings/notifications");
    return {
      status: "success",
      message: "Notification preferences saved for future delivery.",
      fieldErrors: {},
    };
  } catch (error) {
    return persistenceError(error);
  }
}

export async function deleteLibraryDataAction(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await authenticateSettings();
  if (!session) return authenticationError();

  const parsed = deleteLibrarySchema.safeParse({
    confirmation: value(formData, "confirmation"),
  });
  if (!parsed.success) return validationError(flattenZodErrors(parsed.error));

  let removed: number;
  try {
    removed = await deleteOwnedLibraryData(session.client, session.user.id);
  } catch (error) {
    return persistenceError(error);
  }

  for (const path of [
    "/dashboard",
    "/library",
    "/watch-next",
    "/schedule",
    "/settings/data",
  ]) {
    revalidatePath(path);
  }
  redirect(`/settings/data?libraryDeleted=${removed}`);
}

export async function deleteAccountAction(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await authenticateSettings();
  if (!session) return authenticationError();

  const parsed = deleteAccountSchema.safeParse({
    confirmation: value(formData, "confirmation"),
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) return validationError(flattenZodErrors(parsed.error));

  if (!hasRecentServerVerifiedLogin(session.user.last_sign_in_at)) {
    return {
      status: "error",
      message:
        "For your security, sign out and sign in again before deleting your account.",
      fieldErrors: {},
    };
  }

  try {
    await deleteVerifiedAuthUser(session.user);
  } catch (error) {
    return persistenceError(error);
  }

  // The Auth user is gone at this point. This clears the cookie-backed local
  // session; any failure is non-authoritative because getUser can no longer
  // validate the deleted account.
  const { error: signOutError } = await session.client.auth.signOut({
    scope: "local",
  });
  if (signOutError) {
    logSupabaseError("deleted account local sign-out failed", signOutError);
  }
  redirect("/?accountDeleted=1");
}
