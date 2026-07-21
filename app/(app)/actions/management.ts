"use server";

import "server-only";

import { revalidatePath } from "next/cache";

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
  updateLibraryMovie,
} from "@/lib/library/management";
import { createSupabaseManagementDependencies } from "@/lib/library/supabase-management";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function revalidateMovieViews() {
  revalidatePath("/dashboard");
  revalidatePath("/library", "layout");
  revalidatePath("/watch-next");
  revalidatePath("/schedule");
}

function revalidateMovieDetail(movieId: string) {
  if (/^[a-zA-Z0-9-]{1,64}$/.test(movieId)) {
    revalidatePath(`/library/${movieId}`);
  }
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

    revalidateMovieDetail(getString(formData, "movieId"));
    revalidateMovieViews();
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

    revalidateMovieViews();
    return { status: "success", message: "Queue order updated." };
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

    revalidateMovieDetail(scheduled.movieId);
    revalidateMovieViews();
    return { status: "success", message: "Movie scheduled." };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}
