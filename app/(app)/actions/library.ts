"use server";

import "server-only";

import { redirect } from "next/navigation";

import type {
  BulkLibraryActionState,
  LibraryActionState,
} from "@/lib/library/action-state";
import {
  AuthenticationRequiredError,
  LibraryAuthorizationError,
  LibraryConstraintError,
  LibraryPersistenceError,
  LibrarySchemaError,
  LibraryValidationError,
} from "@/lib/library/errors";
import {
  bulkRemoveLibraryMovies,
  bulkUpdateLibraryStatus,
  removeLibraryMovie,
  setLibraryMovieFavourite,
} from "@/lib/library/mutations";
import { getMovieRemovalMessage } from "@/lib/library/removal-feedback";
import { addMovieToLibrary } from "@/lib/library/service";
import { createSupabaseLibraryDependencies } from "@/lib/library/supabase-library";
import { createSupabaseLibraryMutationDependencies } from "@/lib/library/supabase-mutations";
import {
  AdultMovieExcludedError,
  InvalidMovieIdError,
  MovieNotFoundError,
  MovieProviderError,
} from "@/lib/movies/errors";
import { SupabaseAdminConfigurationError } from "@/lib/supabase/admin";
import {
  revalidateLibraryDerivedViews,
  revalidateNotificationViews,
} from "@/lib/revalidation/private-data";

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

    return "Your Library is temporarily unavailable. Try again later.";
  }

  if (
    error instanceof LibraryAuthorizationError ||
    error instanceof LibraryConstraintError ||
    error instanceof LibrarySchemaError ||
    error instanceof LibraryValidationError ||
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

    revalidateLibraryDerivedViews();

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
  let result: Awaited<ReturnType<typeof removeLibraryMovie>>;

  try {
    result = await removeLibraryMovie(
      formData.get("userMovieId"),
      createSupabaseLibraryMutationDependencies(),
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return { status: "error", message: "Please sign in again." };
    }

    if (error instanceof LibraryValidationError) {
      return {
        status: "error",
        message: "The selected movie was invalid. Refresh the page and try again.",
      };
    }

    return {
      status: "error",
      message: "The movie could not be removed. Please try again.",
    };
  }

  if (!result.success || result.matched !== 1 || result.affected !== 1) {
    return {
      status: "error",
      message: "This movie is no longer in your library.",
    };
  }

  const movieTitle = formData.get("movieTitle");
  revalidateLibraryDerivedViews();

  if (formData.get("redirectAfterRemoval") === "true") {
    const removedTitle = typeof movieTitle === "string" ? movieTitle : "Movie";
    redirect(`/library?removed=${encodeURIComponent(removedTitle)}`);
  }

  return {
    status: "success",
    message: getMovieRemovalMessage(movieTitle),
  };
}

export async function setFavouriteAction(
  previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  try {
    const favourite = formData.get("favourite");
    const updated = await setLibraryMovieFavourite(
      formData.get("libraryId"),
      favourite,
      createSupabaseLibraryMutationDependencies(),
    );

    if (!updated) {
      return {
        status: "error",
        message: "That movie is no longer available in your library.",
      };
    }

    revalidateLibraryDerivedViews();

    return {
      status: "success",
      message:
        favourite === "true"
          ? "Added to favourites."
          : "Removed from favourites.",
      favourite: favourite === "true",
    };
  } catch (error) {
    return {
      status: "error",
      message: getActionErrorMessage(error),
      favourite: previousState.favourite,
    };
  }
}

function bulkState(
  previousState: BulkLibraryActionState,
  state: Omit<BulkLibraryActionState, "requestId">,
): BulkLibraryActionState {
  return { ...state, requestId: previousState.requestId + 1 };
}

export async function bulkUpdateStatusAction(
  previousState: BulkLibraryActionState,
  formData: FormData,
): Promise<BulkLibraryActionState> {
  try {
    const result = await bulkUpdateLibraryStatus(
      formData.getAll("libraryIds"),
      formData.get("status"),
      createSupabaseLibraryMutationDependencies(),
    );

    if (!result.success) {
      return bulkState(previousState, {
        status: "error",
        message:
          "Some selected movies were no longer available. No changes were made.",
        affected: 0,
        skipped: result.skipped,
      });
    }

    revalidateLibraryDerivedViews();
    revalidateNotificationViews();
    return bulkState(previousState, {
      status: "success",
      message: `${result.affected} ${
        result.affected === 1 ? "movie" : "movies"
      } updated.`,
      affected: result.affected,
      skipped: result.skipped,
    });
  } catch (error) {
    return bulkState(previousState, {
      status: "error",
      message: getActionErrorMessage(error),
      affected: 0,
      skipped: 0,
    });
  }
}

export async function bulkRemoveMoviesAction(
  previousState: BulkLibraryActionState,
  formData: FormData,
): Promise<BulkLibraryActionState> {
  try {
    const result = await bulkRemoveLibraryMovies(
      formData.getAll("libraryIds"),
      createSupabaseLibraryMutationDependencies(),
    );

    if (!result.success) {
      return bulkState(previousState, {
        status: "error",
        message:
          "Some selected movies were no longer available. No movies were removed.",
        affected: 0,
        skipped: result.skipped,
      });
    }

    revalidateLibraryDerivedViews();
    return bulkState(previousState, {
      status: "success",
      message: `${result.affected} ${
        result.affected === 1 ? "movie" : "movies"
      } removed from your library.`,
      affected: result.affected,
      skipped: result.skipped,
    });
  } catch (error) {
    return bulkState(previousState, {
      status: "error",
      message: getActionErrorMessage(error),
      affected: 0,
      skipped: 0,
    });
  }
}
