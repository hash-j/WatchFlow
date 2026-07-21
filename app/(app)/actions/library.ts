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

function getActionErrorMessage(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return "Your session has expired. Sign in again to manage your library.";
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

    revalidatePath("/library");

    return { status: "success", message: "Removed from your library." };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}
