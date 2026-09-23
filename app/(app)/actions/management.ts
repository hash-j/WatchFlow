"use server";

import "server-only";

import type { LibraryActionState } from "@/lib/library/action-state";
import {
  LibraryAuthorizationError,
  LibraryConstraintError,
  AuthenticationRequiredError,
  LibraryPersistenceError,
  LibrarySchemaError,
  LibraryValidationError,
} from "@/lib/library/errors";
import {
  moveLibraryQueueMovie,
  scheduleLibraryMovie,
  setLibraryWatchNextPriority,
  updateLibraryMovie,
} from "@/lib/library/management";
import { getWatchNextPriorityLabel } from "@/lib/library/watch-next-priority";
import { createSupabaseManagementDependencies } from "@/lib/library/supabase-management";
import {
  revalidateLibraryDerivedViews,
  revalidateQueueViews,
} from "@/lib/revalidation/private-data";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return "Your session has expired. Sign in again to manage your library.";
  }

  if (
    error instanceof LibraryAuthorizationError ||
    error instanceof LibraryConstraintError ||
    error instanceof LibrarySchemaError ||
    error instanceof LibraryValidationError ||
    error instanceof LibraryPersistenceError
  ) {
    return error.message;
  }

  return "WatchFlow could not save that change. Please try again.";
}

export async function updateMovieAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  try {
    const updated = await updateLibraryMovie(
      getString(formData, "libraryId"),
      {
        status: formData.get("status"),
        personalRating: formData.get("personalRating"),
        review: formData.get("review"),
        priority: formData.get("priority"),
        wouldWatchAgain: formData.get("wouldWatchAgain"),
        watchedDate: formData.get("watchedDate"),
        watchedDateProvided: formData.has("watchedDate"),
        scheduledDate: formData.get("scheduledDate"),
        scheduledTime: formData.get("scheduledTime"),
        timezone: formData.get("timezone"),
        scheduleNote: formData.get("scheduleNote"),
      },
      createSupabaseManagementDependencies(),
    );

    if (!updated) {
      return { status: "error", message: "That library item was not found." };
    }

    revalidateLibraryDerivedViews({ movieDetails: false });
    return { status: "success", message: "Movie details saved." };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}

export async function moveQueueMovieAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  try {
    const moved = await moveLibraryQueueMovie(
      getString(formData, "libraryId"),
      formData.get("direction"),
      createSupabaseManagementDependencies(),
    );

    if (!moved) {
      return {
        status: "error",
        message: "That movie is no longer in your Watch Next queue.",
      };
    }

    revalidateQueueViews();
    return { status: "success", message: "Queue order updated." };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}

export async function setQueueMoviePriorityAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  try {
    const priority = formData.get("priority");
    const updated = await setLibraryWatchNextPriority(
      getString(formData, "libraryId"),
      priority,
      createSupabaseManagementDependencies(),
    );

    if (!updated) {
      return {
        status: "error",
        message: "That movie is no longer in your Watch Next queue.",
      };
    }

    revalidateQueueViews();
    return {
      status: "success",
      message: `Priority set to ${getWatchNextPriorityLabel(Number(priority))}. Queue reordered.`,
    };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}

export async function scheduleMovieAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  try {
    const scheduled = await scheduleLibraryMovie(
      getString(formData, "libraryId"),
      {
        scheduledDate: formData.get("scheduledDate"),
        scheduledTime: formData.get("scheduledTime"),
        timezone: formData.get("timezone"),
        scheduleNote: formData.get("scheduleNote"),
      },
      createSupabaseManagementDependencies(),
    );

    if (!scheduled) {
      return { status: "error", message: "That library item was not found." };
    }

    revalidateLibraryDerivedViews({ movieDetails: false });
    return { status: "success", message: "Movie scheduled." };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}
