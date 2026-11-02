"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  ListsAuthenticationError,
  ListsAuthorizationError,
  ListsConflictError,
  ListsMissingColumnError,
  ListsMissingRpcError,
  ListsMissingTableError,
  ListsNotFoundError,
  ListsPersistenceError,
  ListsSchemaCacheError,
  ListsValidationError,
} from "@/lib/lists/errors";
import {
  addOwnedMoviesToList,
  getOwnedListChoices,
  createOwnedCustomList,
  deleteOwnedCustomList,
  moveOwnedCustomList,
  moveOwnedListItem,
  removeOwnedListMovie,
  setOwnedMovieListMemberships,
  updateOwnedCustomList,
} from "@/lib/lists/supabase-lists";
import type { ListActionState } from "@/lib/lists/types";
import {
  addMoviesToListSchema,
  createListSchema,
  deleteListSchema,
  flattenListValidationErrors,
  moveListItemSchema,
  moveCustomListSchema,
  removeListMovieSchema,
  setMovieListMembershipsSchema,
  updateListSchema,
} from "@/lib/lists/validation";
import {
  revalidateListOrderViews,
  revalidateListViews,
  revalidateNotificationViews,
} from "@/lib/revalidation/private-data";

function nextState(
  previousState: ListActionState,
  state: Omit<ListActionState, "requestId">,
): ListActionState {
  return { ...state, requestId: previousState.requestId + 1 };
}

function errorState(
  previousState: ListActionState,
  message: string,
  fieldErrors: Record<string, string[]> = {},
) {
  return nextState(previousState, {
    status: "error",
    message,
    fieldErrors,
  });
}

function successState(previousState: ListActionState, message: string) {
  return nextState(previousState, {
    status: "success",
    message,
    fieldErrors: {},
  });
}

function listErrorMessage(error: unknown) {
  if (
    error instanceof ListsAuthenticationError ||
    error instanceof ListsAuthorizationError ||
    error instanceof ListsMissingTableError ||
    error instanceof ListsMissingColumnError ||
    error instanceof ListsMissingRpcError ||
    error instanceof ListsSchemaCacheError ||
    error instanceof ListsNotFoundError ||
    error instanceof ListsValidationError ||
    error instanceof ListsPersistenceError
  ) {
    return error.message;
  }

  if (error instanceof ListsConflictError) {
    return "You already have a list with that name.";
  }

  return "The custom list could not be updated. Please try again.";
}

export async function getBulkListChoicesAction(): Promise<{ lists: { id: string; name: string }[]; error: string | null }> {
  try { return { lists: await getOwnedListChoices(), error: null }; }
  catch (error) { return { lists: [], error: listErrorMessage(error) }; }
}

export async function createListAction(
  previousState: ListActionState,
  formData: FormData,
): Promise<ListActionState> {
  const parsed = createListSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });

  if (!parsed.success) {
    return errorState(
      previousState,
      "Check the list details and try again.",
      flattenListValidationErrors(parsed.error),
    );
  }

  let createdId: string;
  try {
    const created = await createOwnedCustomList(parsed.data);
    createdId = created.id;
  } catch (error) {
    if (error instanceof ListsConflictError) {
      return errorState(previousState, error.message, {
        name: [error.message],
      });
    }

    return errorState(previousState, listErrorMessage(error));
  }

  revalidateListViews({ allMovieDetails: true });
  redirect(`/lists/${createdId}?created=1`);
}

export async function updateListAction(
  previousState: ListActionState,
  formData: FormData,
): Promise<ListActionState> {
  const parsed = updateListSchema.safeParse({
    listId: formData.get("listId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });

  if (!parsed.success) {
    return errorState(
      previousState,
      "Check the list details and try again.",
      flattenListValidationErrors(parsed.error),
    );
  }

  try {
    const updated = await updateOwnedCustomList(parsed.data);
    if (!updated) {
      return errorState(
        previousState,
        "This list is no longer available.",
      );
    }

    revalidateListViews({ allMovieDetails: true });
    return successState(previousState, "List details saved.");
  } catch (error) {
    if (error instanceof ListsConflictError) {
      return errorState(previousState, error.message, {
        name: [error.message],
      });
    }

    return errorState(previousState, listErrorMessage(error));
  }
}

export async function deleteListAction(
  previousState: ListActionState,
  formData: FormData,
): Promise<ListActionState> {
  const parsed = deleteListSchema.safeParse({
    listId: formData.get("listId"),
    confirmation: formData.get("confirmation"),
  });

  if (!parsed.success) {
    return errorState(
      previousState,
      "Type the list name exactly to confirm deletion.",
      flattenListValidationErrors(parsed.error),
    );
  }

  try {
    const removed = await deleteOwnedCustomList(
      parsed.data.listId,
      parsed.data.confirmation,
    );

    if (!removed) {
      return errorState(
        previousState,
        "This list is no longer available.",
      );
    }
  } catch (error) {
    return errorState(previousState, listErrorMessage(error));
  }

  revalidateListViews({ allMovieDetails: true });
  redirect("/lists?deleted=1");
}

export async function addMoviesToListAction(
  previousState: ListActionState,
  formData: FormData,
): Promise<ListActionState> {
  const parsed = addMoviesToListSchema.safeParse({
    listId: formData.get("listId"),
    userMovieIds: formData.getAll("userMovieIds"),
  });

  if (!parsed.success) {
    return errorState(
      previousState,
      "Choose valid movies from your library.",
      flattenListValidationErrors(parsed.error),
    );
  }

  try {
    const result = await addOwnedMoviesToList(parsed.data);
    if (!result.success) {
      return errorState(
        previousState,
        result.reason === "selection_changed"
          ? "Some selected movies are no longer in your library. No movies were added."
          : "This list is no longer available.",
      );
    }

    if (result.added > 0) {
      revalidateListViews({ allMovieDetails: true });
      // Membership-only additions do not need a root-layout/application reload.
      revalidatePath("/notifications");
    }

    const addedLabel = `${result.added} ${
      result.added === 1 ? "movie" : "movies"
    } added.`;
    const skippedLabel =
      result.skipped > 0
        ? ` ${result.skipped} already ${
            result.skipped === 1 ? "belongs" : "belong"
          } to this list.`
        : "";

    return successState(previousState, `${addedLabel}${skippedLabel}`);
  } catch (error) {
    return errorState(previousState, listErrorMessage(error));
  }
}

export async function moveListItemAction(
  previousState: ListActionState,
  formData: FormData,
): Promise<ListActionState> {
  const parsed = moveListItemSchema.safeParse({
    listMovieId: formData.get("listMovieId"),
    direction: formData.get("direction"),
  });

  if (!parsed.success) {
    return errorState(previousState, "The selected list movie was invalid.");
  }

  try {
    const result = await moveOwnedListItem(
      parsed.data.listMovieId,
      parsed.data.direction,
    );

    if (!result.success) {
      return errorState(
        previousState,
        "This movie is no longer in the list.",
      );
    }

    revalidateListViews();
    if (result.moved && result.listId) revalidatePath(`/lists/${result.listId}`);
    return successState(
      previousState,
      result.moved
        ? "List order saved."
        : parsed.data.direction === "up"
          ? "This movie is already first."
          : "This movie is already last.",
    );
  } catch (error) {
    return errorState(previousState, listErrorMessage(error));
  }
}

export async function moveCustomListAction(
  previousState: ListActionState,
  formData: FormData,
): Promise<ListActionState> {
  const parsed = moveCustomListSchema.safeParse({
    listId: formData.get("listId"),
    direction: formData.get("direction"),
  });

  if (!parsed.success) {
    return errorState(previousState, "The selected list was invalid.");
  }

  try {
    const result = await moveOwnedCustomList(
      parsed.data.listId,
      parsed.data.direction,
    );

    if (!result.success) {
      return errorState(previousState, "This list is no longer available.");
    }

    revalidateListOrderViews();
    return successState(
      previousState,
      result.moved
        ? "List order saved."
        : parsed.data.direction === "up"
          ? "This list is already first."
          : "This list is already last.",
    );
  } catch (error) {
    return errorState(previousState, listErrorMessage(error));
  }
}

export async function removeMovieFromListAction(
  previousState: ListActionState,
  formData: FormData,
): Promise<ListActionState> {
  const parsed = removeListMovieSchema.safeParse({
    listMovieId: formData.get("listMovieId"),
  });

  if (!parsed.success) {
    return errorState(previousState, "The selected list movie was invalid.");
  }

  try {
    const result = await removeOwnedListMovie(parsed.data.listMovieId);
    if (!result.success || result.removed !== true) {
      return errorState(
        previousState,
        "This movie is no longer in the list.",
      );
    }

    revalidateListViews({ allMovieDetails: true });
    return successState(
      previousState,
      "Removed from this list. The movie remains in your library.",
    );
  } catch (error) {
    return errorState(previousState, listErrorMessage(error));
  }
}

export async function setMovieListMembershipsAction(
  previousState: ListActionState,
  formData: FormData,
): Promise<ListActionState> {
  const parsed = setMovieListMembershipsSchema.safeParse({
    userMovieId: formData.get("userMovieId"),
    listIds: formData.getAll("listIds"),
  });

  if (!parsed.success) {
    return errorState(
      previousState,
      "The selected list memberships were invalid.",
      flattenListValidationErrors(parsed.error),
    );
  }

  try {
    const result = await setOwnedMovieListMemberships(
      parsed.data.userMovieId,
      parsed.data.listIds,
    );

    if (!result.success) {
      return errorState(
        previousState,
        result.reason === "selection_changed"
          ? "One or more lists changed. Refresh and try again."
          : "This movie is no longer in your library.",
      );
    }

    revalidateListViews();
    if (result.added > 0) revalidateNotificationViews();

    return successState(
      previousState,
      `List memberships saved: ${result.added} added, ${result.removedCount} removed.`,
    );
  } catch (error) {
    return errorState(previousState, listErrorMessage(error));
  }
}
