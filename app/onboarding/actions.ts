"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AuthenticationRequiredError,
  LibraryAuthorizationError,
  LibraryConstraintError,
  LibraryPersistenceError,
  LibrarySchemaError,
  LibraryValidationError,
} from "@/lib/library/errors";
import { bulkUpdateLibraryStatus } from "@/lib/library/mutations";
import { addMovieToLibrary } from "@/lib/library/service";
import { createSupabaseLibraryDependencies } from "@/lib/library/supabase-library";
import { createSupabaseLibraryMutationDependencies } from "@/lib/library/supabase-mutations";
import {
  AdultMovieExcludedError,
  InvalidMovieIdError,
  MovieNotFoundError,
  MovieProviderError,
} from "@/lib/movies/errors";
import {
  authenticateOnboarding,
  completeOwnedOnboarding,
  findOwnedLibraryMovieByTmdbId,
  hasVerifiedEmail,
  updateOwnedOnboardingTimezone,
} from "@/lib/onboarding/supabase-onboarding";
import type { OnboardingActionState } from "@/lib/onboarding/types";
import {
  onboardingPreferencesSchema,
  validateOnboardingMovieStatus,
} from "@/lib/onboarding/validation";
import { readUserPreferences, updateApplicationPreferences } from "@/lib/settings/supabase-settings";
import { flattenZodErrors } from "@/lib/settings/validation";
import { SupabaseAdminConfigurationError } from "@/lib/supabase/admin";

function value(formData: FormData, key: string) {
  const result = formData.get(key);
  return typeof result === "string" ? result : "";
}

function errorState(
  message: string,
  fieldErrors: Record<string, string[]> = {},
): OnboardingActionState {
  return { status: "error", message, fieldErrors };
}

function authenticationError() {
  return errorState(
    "Your verified session has expired. Sign in again to continue.",
  );
}

function safeMovieError(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return "Your session has expired. Sign in again to add movies.";
  }

  if (error instanceof SupabaseAdminConfigurationError) {
    return "The library service is not configured. Please contact support.";
  }

  if (
    error instanceof LibraryAuthorizationError ||
    error instanceof LibraryConstraintError ||
    error instanceof LibraryPersistenceError ||
    error instanceof LibrarySchemaError ||
    error instanceof LibraryValidationError ||
    error instanceof InvalidMovieIdError ||
    error instanceof MovieNotFoundError ||
    error instanceof AdultMovieExcludedError ||
    error instanceof MovieProviderError
  ) {
    return error.message;
  }

  return "WatchFlow could not add that movie. Please try again.";
}

const REVALIDATED_PRODUCT_PATHS = [
  "/onboarding",
  "/dashboard",
  "/search",
  "/library",
  "/statistics",
  "/watch-next",
  "/schedule",
  "/lists",
  "/picker",
  "/recommendations",
  "/settings/preferences",
] as const;

function revalidateOnboardingProductViews() {
  for (const path of REVALIDATED_PRODUCT_PATHS) revalidatePath(path);
  revalidatePath("/library", "layout");
  revalidatePath("/lists", "layout");
}

export async function saveOnboardingPreferencesAction(
  _previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const session = await authenticateOnboarding();
  if (!session || !hasVerifiedEmail(session.user)) return authenticationError();

  const parsed = onboardingPreferencesSchema.safeParse({
    timezone: value(formData, "timezone"),
    defaultLibraryView: value(formData, "defaultLibraryView"),
    preferredLanguage: value(formData, "preferredLanguage"),
  });

  if (!parsed.success) {
    return errorState(
      "Review the highlighted preferences and try again.",
      flattenZodErrors(parsed.error),
    );
  }

  try {
    const existing = await readUserPreferences(
      session.client,
      session.user.id,
    );
    await updateOwnedOnboardingTimezone(
      session.client,
      session.user.id,
      parsed.data.timezone,
    );
    await updateApplicationPreferences(session.client, session.user.id, {
      ...existing,
      defaultLibraryView: parsed.data.defaultLibraryView,
      preferredLanguage: parsed.data.preferredLanguage,
    });
  } catch {
    return errorState(
      "WatchFlow could not save those preferences. Your previous choices are still safe; please try again.",
    );
  }

  revalidatePath("/onboarding");
  revalidatePath("/search");
  revalidatePath("/library");
  revalidatePath("/schedule");
  revalidatePath("/statistics");
  redirect("/onboarding?step=3");
}

export async function addOnboardingMovieAction(
  _previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const status = validateOnboardingMovieStatus(formData.get("status"));
  if (!status.success) {
    return errorState(status.error.issues[0]?.message ?? "Choose a status.");
  }

  const tmdbId = Number(formData.get("tmdbId"));
  const session = await authenticateOnboarding();
  if (!session || !hasVerifiedEmail(session.user)) return authenticationError();

  try {
    const addResult = await addMovieToLibrary(
      tmdbId,
      createSupabaseLibraryDependencies(),
    );
    const ownedMovie = await findOwnedLibraryMovieByTmdbId(
      session.client,
      session.user.id,
      tmdbId,
    );

    if (!ownedMovie) {
      return errorState(
        "That movie was saved, but its status could not be confirmed. Open your Library to review it.",
      );
    }

    const updateResult = await bulkUpdateLibraryStatus(
      [ownedMovie.libraryId],
      status.data,
      createSupabaseLibraryMutationDependencies(),
    );
    if (!updateResult.success || updateResult.affected !== 1) {
      return errorState(
        "That movie is in your Library, but its status could not be updated. You can change it later.",
      );
    }

    revalidateOnboardingProductViews();
    const statusLabel =
      status.data === "watched" ? "Watched" : "Want to Watch";
    return {
      status: "success",
      message:
        addResult === "duplicate"
          ? `Already in your Library. Status set to ${statusLabel}.`
          : `Added as ${statusLabel}.`,
      fieldErrors: {},
    };
  } catch (error) {
    return errorState(safeMovieError(error));
  }
}

async function finishOnboarding(): Promise<OnboardingActionState> {
  const session = await authenticateOnboarding();
  if (!session || !hasVerifiedEmail(session.user)) return authenticationError();

  try {
    await completeOwnedOnboarding(session.client, session.user.id);
  } catch {
    return errorState(
      "WatchFlow could not finish setup. Your saved preferences and movies are still safe; please try again.",
    );
  }

  revalidateOnboardingProductViews();
  redirect("/dashboard");
}

export async function completeOnboardingAction(
  _previousState: OnboardingActionState,
  _formData: FormData,
) {
  void _previousState;
  void _formData;
  return finishOnboarding();
}

export async function skipOnboardingAction(
  _previousState: OnboardingActionState,
  _formData: FormData,
) {
  void _previousState;
  void _formData;
  return finishOnboarding();
}
