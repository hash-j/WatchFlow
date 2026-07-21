"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import type { LibraryActionState } from "@/lib/library/action-state";
import {
  AuthenticationRequiredError,
  LibraryPersistenceError,
} from "@/lib/library/errors";
import {
  addMovieToLibrary,
  removeMovieFromLibrary,
} from "@/lib/library/service";
import { createSupabaseLibraryDependencies } from "@/lib/library/supabase-library";
import {
  AdultMovieExcludedError,
  InvalidMovieIdError,
  MovieNotFoundError,
  MovieProviderError,
} from "@/lib/movies/errors";
import { SupabaseAdminConfigurationError } from "@/lib/supabase/admin";

function getActionErrorMessage(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return "Your session has expired. Sign in again to manage your library.";
  }

  if (error instanceof SupabaseAdminConfigurationError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[WatchFlow] Supabase admin configuration error", {
        message: error.message,
      });
    }

    return "The library service is not configured. Please contact support.";
  }

  if (
    error instanceof InvalidMovieIdError ||
    error instanceof MovieNotFoundError ||
    error instanceof AdultMovieExcludedError ||
    error instanceof MovieProviderError ||
    error instanceof LibraryPersistenceError
  ) {
    return error.message;
  }

  return "WatchFlow could not update your library. Please try again.";
}

export async function addMovieAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const tmdbId = Number(formData.get("tmdbId"));

  try {
    const result = await addMovieToLibrary(
      tmdbId,
      createSupabaseLibraryDependencies(),
    );

    revalidatePath("/dashboard");
    revalidatePath("/library");

    return result === "duplicate"
      ? { status: "success", message: "This movie is already in your library." }
      : { status: "success", message: "Added to your library." };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}

export async function removeMovieAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const libraryId = formData.get("libraryId");

  try {
    const removed = await removeMovieFromLibrary(
      typeof libraryId === "string" ? libraryId : "",
      createSupabaseLibraryDependencies(),
    );

    if (!removed) {
      return { status: "error", message: "That library item was not found." };
    }

    revalidatePath("/dashboard");
    revalidatePath("/library", "layout");
    revalidatePath("/watch-next");
    revalidatePath("/schedule");

    return { status: "success", message: "Removed from your library." };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}
